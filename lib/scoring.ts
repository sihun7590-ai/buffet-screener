import {
  AXIS_WEIGHTS,
  SCORE_AXES,
  type AxisCoverage,
  type AxisScores,
  type CriterionResult,
  type IntrinsicValueEstimate,
  type ScoreAxis,
  type StockScore,
  type TickerFinancials,
} from "./types";

// Bump when the formula changes. Stored on every score so a history chart can
// distinguish "the company changed" from "we changed how we measure".
// v3: trailing-twelve-month periods from quarterly filings, and growth
// annualised by elapsed time rather than by how many entries are in the series.
// v4: a criterion whose input the filing doesn't carry is dropped from its axis
// instead of scored zero, and the axis reports how much of it was measurable.
// Debt tags widened to the finance-lease concepts most filers now use, so the
// ~90 companies that read as debt-free are scored on the debt they carry; book
// equity below zero no longer walks a "lower is better" ramp to full marks.
export const SCORING_VERSION = 4;

// Rough sector P/E benchmarks for the "cheaper than its sector" check —
// neither SEC nor Yahoo expose a sector-average endpoint, so this is a
// static approximation — good enough as a sanity check, not a precise index.
// Keys match the GICS sector names used in data/universe.json.
const SECTOR_AVG_PE: Record<string, number> = {
  "Information Technology": 28,
  "Communication Services": 22,
  "Consumer Discretionary": 24,
  "Consumer Staples": 21,
  "Health Care": 24,
  Financials: 14,
  Industrials: 20,
  Energy: 12,
  Utilities: 18,
  Materials: 16,
  "Real Estate": 18,
};
const DEFAULT_SECTOR_PE = 20;

function average(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = average(values);
  return Math.sqrt(average(values.map((v) => (v - m) ** 2)));
}

function cagr(first: number, last: number, years: number): number {
  if (first <= 0 || last <= 0 || years <= 0) return 0;
  return (last / first) ** (1 / years) - 1;
}

export interface DatedValue {
  date: string;
  value: number;
}

const YEAR_MS = 365.25 * 86_400_000;
const yearsBetween = (from: string, to: string) => (new Date(to).getTime() - new Date(from).getTime()) / YEAR_MS;

// Compound growth across a full oldest→newest series, looking back at most
// `maxYears`.
//
// Annualised by the elapsed time between the two endpoints rather than by how
// many entries sit between them. Those are not the same once a trailing-
// twelve-month period joins the fiscal years: counting entries would divide
// roughly four years of growth by five and understate every company's growth
// in exactly the same direction.
function seriesCagr(points: DatedValue[], maxYears = 5): number {
  const usable = points.filter((p) => Number.isFinite(p.value));
  if (usable.length < 2) return NaN;

  const last = usable[usable.length - 1];
  let from = usable[usable.length - 2];
  for (let i = usable.length - 2; i >= 0; i--) {
    if (yearsBetween(usable[i].date, last.date) > maxYears + 0.5) break;
    from = usable[i];
  }

  const years = yearsBetween(from.date, last.date);
  if (years <= 0) return NaN;
  return cagr(from.value, last.value, years);
}

// Drops entries that overlap a more recent one. A trailing-twelve-month period
// covers most of the fiscal year before it, so averaging the two would count
// those months twice and quietly weight the average toward recent quarters.
function withoutOverlaps(points: DatedValue[], minGapYears = 0.75): DatedValue[] {
  const out: DatedValue[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const last = out[out.length - 1];
    if (!last || yearsBetween(points[i].date, last.date) >= minGapYears) out.push(points[i]);
  }
  return out.reverse();
}

// Linearly scales `value` between [low, high] into [0, maxPoints].
// If higherIsBetter is false, the ramp is reversed (lower value = more points).
function linScore(value: number, low: number, high: number, maxPoints: number, higherIsBetter = true): number {
  if (!Number.isFinite(value)) return 0;
  if (high === low) {
    // Degenerate range (e.g. a recent IPO with only as many years of data
    // as the "full marks" threshold) — (value - low) / (high - low) would
    // divide by zero. Treat "met the single point" as full marks.
    const met = higherIsBetter ? value >= high : value <= high;
    return met ? maxPoints : 0;
  }
  const t = (value - low) / (high - low);
  const clamped = Math.min(1, Math.max(0, t));
  return (higherIsBetter ? clamped : 1 - clamped) * maxPoints;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function criterion(
  axis: ScoreAxis,
  id: string,
  passed: boolean,
  points: number,
  maxPoints: number,
  values: Record<string, number>,
): CriterionResult {
  return { id, axis, passed, points: round1(Math.min(maxPoints, Math.max(0, points))), maxPoints, values };
}

// The filing doesn't carry what this criterion needs. Scoring it zero would
// claim we looked and the answer was bad; instead it drops out of its axis
// altogether (see the renormalisation in scoreTicker) and the axis reports
// reduced coverage.
//
// Reserved strictly for absent data. A number that is present and unfavourable
// — a loss, negative book equity, falling revenue — is a measurement, and goes
// through `criterion` with the zero it earned.
function unavailable(axis: ScoreAxis, id: string, maxPoints: number, values: Record<string, number>): CriterionResult {
  return { id, axis, passed: false, points: 0, maxPoints, values, available: false };
}

export function computeIntrinsicValue(f: TickerFinancials): IntrinsicValueEstimate {
  const cashFlows = [...f.cashFlow].reverse(); // oldest -> newest
  // capitalExpenditure is stored as a negative outflow, so FCF = OCF + capex.
  const fcfHistory: DatedValue[] = cashFlows.map((c) => ({
    date: c.date,
    value: c.freeCashFlow ?? c.operatingCashFlow + c.capitalExpenditure,
  }));
  // Three years of cash flow, smoothing out a lumpy year — but three
  // *distinct* years, not a trailing-twelve-month period stacked on the fiscal
  // year it mostly duplicates.
  const recent = withoutOverlaps(fcfHistory).slice(-3).map((p) => p.value);
  const shares = f.income[0]?.weightedAverageShsOutDil;

  // Without a usable share count we can't derive a per-share intrinsic value
  // at all — propagate NaN rather than silently dividing by a placeholder,
  // which would produce a wildly wrong "intrinsic value".
  const ownerEarningsPerShare = Number.isFinite(shares) && shares! > 0 ? average(recent) / shares! : NaN;

  const rawGrowth = seriesCagr(fcfHistory);
  const growthRateUsed = Math.min(0.12, Math.max(0, rawGrowth || 0));

  const discountRate = 0.095;
  const terminalGrowthRate = 0.025;
  const projectionYears = 5;

  let pvOfProjectedFcf = 0;
  let fcfAtYear = ownerEarningsPerShare;
  for (let year = 1; year <= projectionYears; year++) {
    fcfAtYear = fcfAtYear * (1 + growthRateUsed);
    pvOfProjectedFcf += fcfAtYear / (1 + discountRate) ** year;
  }
  const terminalValue = (fcfAtYear * (1 + terminalGrowthRate)) / (discountRate - terminalGrowthRate);
  const pvOfTerminalValue = terminalValue / (1 + discountRate) ** projectionYears;

  const intrinsicValuePerShare = pvOfProjectedFcf + pvOfTerminalValue;
  const currentPrice = f.quote.price;
  // When intrinsic value comes out near zero (volatile/thin trailing FCF —
  // common for richly-priced growth names), the ratio blows up toward
  // -Infinity without adding any real information beyond "very overvalued",
  // so clamp the floor at -100%.
  const rawMarginOfSafety = intrinsicValuePerShare > 0 ? (intrinsicValuePerShare - currentPrice) / intrinsicValuePerShare : -1;
  const marginOfSafety = Math.max(-1, rawMarginOfSafety);

  return {
    ownerEarningsPerShare,
    growthRateUsed,
    discountRate,
    terminalGrowthRate,
    intrinsicValuePerShare,
    currentPrice,
    marginOfSafety,
  };
}

// ---------------------------------------------------------------------------
// Quality — how good is the business itself? (100 pts)
// ---------------------------------------------------------------------------
function scoreQuality(f: TickerFinancials): CriterionResult[] {
  const roeAvg = average(f.keyMetrics.slice(0, 5).map((k) => k.returnOnEquity).filter(Number.isFinite));
  const roicAvg = average(f.keyMetrics.slice(0, 5).map((k) => k.returnOnInvestedCapital).filter(Number.isFinite));

  const marginHistory = f.ratios.slice(0, 5).map((r) => r.grossProfitMargin).filter(Number.isFinite);
  const marginAvg = average(marginHistory);
  // stdev([]) is 0, which would read as "perfectly stable" and hand out the
  // stability points to a filer that never tagged gross profit at all. Missing
  // data has to score nothing, not full marks.
  const stabilityPenalty = marginHistory.length >= 2 ? stdev(marginHistory) / (marginAvg || 1) : NaN;
  const hasMarginData = Number.isFinite(marginAvg);

  const opMargins = f.income
    .slice(0, 5)
    .map((i) => (i.revenue > 0 ? i.operatingIncome / i.revenue : NaN))
    .filter(Number.isFinite);
  const operatingMargin = average(opMargins);

  const latestRevenue = f.income[0]?.revenue ?? NaN;
  const latestFcf = f.cashFlow[0]?.freeCashFlow ?? NaN;
  const fcfMargin = Number.isFinite(latestFcf) && latestRevenue > 0 ? latestFcf / latestRevenue : NaN;

  const sharesAsc = [...f.income].reverse().map((i) => i.weightedAverageShsOutDil).filter(Number.isFinite);
  // Positive = share count shrinking = buybacks returning capital to holders.
  const shareCountDelta = sharesAsc.length >= 2 ? (sharesAsc[0] - sharesAsc[sharesAsc.length - 1]) / sharesAsc[0] : NaN;

  return [
    Number.isFinite(roeAvg)
      ? criterion("quality", "roe", roeAvg >= 0.15, linScore(roeAvg, 0.08, 0.15, 28), 28, { roeAvg })
      : unavailable("quality", "roe", 28, { roeAvg }),
    Number.isFinite(roicAvg)
      ? criterion("quality", "roic", roicAvg >= 0.12, linScore(roicAvg, 0.06, 0.12, 28), 28, { roicAvg })
      : unavailable("quality", "roic", 28, { roicAvg }),
    hasMarginData
      ? criterion(
          "quality",
          "grossMargin",
          marginAvg >= 0.35 && stabilityPenalty < 0.15,
          linScore(marginAvg, 0.2, 0.45, 11) + linScore(stabilityPenalty, 0.05, 0.25, 5, false),
          16,
          { marginAvg, stabilityPenalty },
        )
      : unavailable("quality", "grossMargin", 16, { marginAvg, stabilityPenalty }),
    Number.isFinite(operatingMargin)
      ? criterion("quality", "operatingMargin", operatingMargin >= 0.15, linScore(operatingMargin, 0.05, 0.2, 10), 10, {
          operatingMargin,
        })
      : unavailable("quality", "operatingMargin", 10, { operatingMargin }),
    Number.isFinite(fcfMargin)
      ? criterion("quality", "fcfMargin", fcfMargin >= 0.1, linScore(fcfMargin, 0.05, 0.2, 10), 10, { fcfMargin })
      : unavailable("quality", "fcfMargin", 10, { fcfMargin }),
    Number.isFinite(shareCountDelta)
      ? criterion("quality", "shareCount", shareCountDelta > 0, linScore(shareCountDelta, -0.05, 0.1, 8), 8, {
          shareCountDelta,
        })
      : unavailable("quality", "shareCount", 8, { shareCountDelta }),
  ];
}

// ---------------------------------------------------------------------------
// Growth — is the business getting bigger? (100 pts)
// ---------------------------------------------------------------------------
function scoreGrowth(f: TickerFinancials): CriterionResult[] {
  const incomeAsc = [...f.income].reverse();
  const cashFlowAsc = [...f.cashFlow].reverse();

  const revenue = incomeAsc.map((i) => ({ date: i.date, value: i.revenue }));
  const eps = incomeAsc.map((i) => ({ date: i.date, value: i.eps }));
  const fcf = cashFlowAsc.map((c) => ({ date: c.date, value: c.freeCashFlow }));

  // Growth needs two points to measure between. Fewer than that is missing
  // data; two or more that produce no rate — earnings that crossed from profit
  // to loss, say — is a measurement, and a bad one.
  const measurable = (points: DatedValue[]) => points.filter((p) => Number.isFinite(p.value)).length >= 2;

  const revenueCagr = seriesCagr(revenue);
  const epsCagr = seriesCagr(eps);
  const fcfCagr = seriesCagr(fcf);

  return [
    measurable(revenue)
      ? criterion("growth", "revenueCagr", revenueCagr >= 0.05, linScore(revenueCagr, 0, 0.1, 35), 35, { revenueCagr })
      : unavailable("growth", "revenueCagr", 35, { revenueCagr }),
    measurable(eps)
      ? criterion("growth", "epsCagr", epsCagr >= 0.05, linScore(epsCagr, 0, 0.1, 35), 35, { epsCagr })
      : unavailable("growth", "epsCagr", 35, { epsCagr }),
    measurable(fcf)
      ? criterion("growth", "fcfCagr", fcfCagr >= 0.05, linScore(fcfCagr, 0, 0.1, 30), 30, { fcfCagr })
      : unavailable("growth", "fcfCagr", 30, { fcfCagr }),
  ];
}

// ---------------------------------------------------------------------------
// Financial Health — can it survive a bad year? (100 pts)
// ---------------------------------------------------------------------------
function scoreHealth(f: TickerFinancials): CriterionResult[] {
  const interestCoverage = f.ratios[0]?.interestCoverageRatio ?? NaN;
  const currentRatio = f.ratios[0]?.currentRatio ?? NaN;

  const debt = f.balance[0]?.totalDebt ?? NaN;
  const equity = f.balance[0]?.totalStockholdersEquity ?? NaN;
  const cash = f.balance[0]?.cashAndCashEquivalents ?? NaN;
  const ebitda = f.income[0]?.ebitda ?? NaN;
  const operatingIncome = f.income[0]?.operatingIncome ?? NaN;
  const hasDebt = Number.isFinite(debt);

  // A debt-free balance sheet is the best possible answer to these, not a
  // missing one — treat it as such instead of scoring a NaN ratio 0.
  const debtFree = hasDebt && debt <= 0;
  const netDebtToEbitda = debtFree ? 0 : hasDebt && Number.isFinite(cash) && ebitda > 0 ? (debt - cash) / ebitda : NaN;
  const cashToDebt = debtFree ? Infinity : Number.isFinite(cash) && debt > 0 ? cash / debt : NaN;

  // Book equity below zero — the buyback-heavy franchises (McDonald's, Home
  // Depot, Starbucks) and the genuinely distressed both land here. Debt over
  // negative equity comes out negative, and a negative ratio walks straight
  // through a "lower is better" ramp to full marks: 28 companies were scoring
  // 30/30 on leverage for having no book equity left. It isn't missing data —
  // the balance sheet says so plainly — so it's measured, and it scores zero.
  // Graham's criteria want book value above zero, and the leverage these
  // companies do carry still shows up in net debt / EBITDA next door.
  const debtEquity = hasDebt && Number.isFinite(equity) && equity > 0 ? debt / equity : NaN;
  const negativeEquity = Number.isFinite(equity) && equity <= 0;

  return [
    hasDebt && Number.isFinite(equity)
      ? criterion(
          "health",
          "debtToEquity",
          !negativeEquity && debtEquity <= 0.5,
          negativeEquity ? 0 : linScore(debtEquity, 0.3, 1.0, 30, false),
          30,
          { debtEquity, equity },
        )
      : unavailable("health", "debtToEquity", 30, { debtEquity, equity }),
    // No interest to cover is the strongest possible reading, but only for a
    // company we can see is debt-free. Where debt exists and the interest line
    // is simply untagged, we don't know.
    debtFree
      ? criterion("health", "interestCoverage", true, 25, 25, { interestCoverage: Infinity })
      : Number.isFinite(interestCoverage)
        ? criterion("health", "interestCoverage", interestCoverage >= 5, linScore(interestCoverage, 2, 8, 25), 25, {
            interestCoverage,
          })
        : // Operating income present but no interest expense tagged, on a
          // balance sheet we can't confirm is debt-free — unmeasurable either way.
          unavailable("health", "interestCoverage", 25, { interestCoverage, operatingIncome }),
    Number.isFinite(currentRatio)
      ? criterion("health", "currentRatio", currentRatio >= 1.5, linScore(currentRatio, 1.0, 1.5, 20), 20, { currentRatio })
      : unavailable("health", "currentRatio", 20, { currentRatio }),
    Number.isFinite(netDebtToEbitda)
      ? criterion("health", "netDebtToEbitda", netDebtToEbitda <= 3, linScore(netDebtToEbitda, 0, 3, 15, false), 15, {
          netDebtToEbitda,
        })
      : unavailable("health", "netDebtToEbitda", 15, { netDebtToEbitda }),
    debtFree
      ? criterion("health", "cashToDebt", true, 10, 10, { cashToDebt: Infinity })
      : Number.isFinite(cashToDebt)
        ? criterion("health", "cashToDebt", cashToDebt >= 0.5, linScore(cashToDebt, 0.1, 0.5, 10), 10, { cashToDebt })
        : unavailable("health", "cashToDebt", 10, { cashToDebt }),
  ];
}

// ---------------------------------------------------------------------------
// Consistency — Buffett's "predictable earnings" test. (100 pts)
// ---------------------------------------------------------------------------
function scoreConsistency(f: TickerFinancials): CriterionResult[] {
  const incomeAsc = [...f.income].reverse();
  const cashFlowAsc = [...f.cashFlow].reverse();

  // Count only years we actually have a figure for: `NaN < 0` is false, so
  // counting losses across untagged years would read a filer with no earnings
  // data as never having lost money.
  const netIncomeYears = incomeAsc.map((i) => i.netIncome).filter(Number.isFinite);
  const totalYears = netIncomeYears.length;
  const lossYears = netIncomeYears.filter((v) => v < 0).length;

  const fcfYears = cashFlowAsc.filter((c) => Number.isFinite(c.freeCashFlow)).length;
  const fcfPositiveYears = cashFlowAsc.filter((c) => c.freeCashFlow > 0).length;
  const fcfPositiveRatio = fcfYears > 0 ? fcfPositiveYears / fcfYears : NaN;

  const revenues = incomeAsc.map((i) => i.revenue).filter(Number.isFinite);
  let growthYears = 0;
  for (let i = 1; i < revenues.length; i++) {
    if (revenues[i] > revenues[i - 1]) growthYears++;
  }
  const revenueGrowthRatio = revenues.length >= 2 ? growthYears / (revenues.length - 1) : NaN;

  return [
    totalYears > 0
      ? criterion("consistency", "epsPositiveYears", lossYears === 0, linScore(lossYears, 0, 3, 40, false), 40, {
          lossYears,
          totalYears,
        })
      : unavailable("consistency", "epsPositiveYears", 40, { lossYears, totalYears }),
    fcfYears > 0
      ? criterion(
          "consistency",
          "fcfPositiveYears",
          fcfPositiveYears === fcfYears,
          linScore(fcfPositiveRatio, 0.5, 1.0, 35),
          35,
          { fcfPositiveYears, totalYears: fcfYears },
        )
      : unavailable("consistency", "fcfPositiveYears", 35, { fcfPositiveYears, totalYears: fcfYears }),
    revenues.length >= 2
      ? criterion("consistency", "revenueConsistency", revenueGrowthRatio >= 0.8, linScore(revenueGrowthRatio, 0.5, 1.0, 25), 25, {
          revenueGrowthRatio,
          growthYears,
          totalYears: revenues.length - 1,
        })
      : unavailable("consistency", "revenueConsistency", 25, {
          revenueGrowthRatio,
          growthYears,
          totalYears: Math.max(0, revenues.length - 1),
        }),
  ];
}

// ---------------------------------------------------------------------------
// Valuation — is it cheap relative to what it's worth? (100 pts)
// ---------------------------------------------------------------------------
function scoreValuation(f: TickerFinancials, iv: IntrinsicValueEstimate): CriterionResult[] {
  const peHistory = f.ratios.slice(0, 5).map((r) => r.priceToEarningsRatio).filter((v) => Number.isFinite(v) && v > 0);
  const peOwnAvg = average(peHistory);
  // The live quote carries no P/E, so derive it from today's price against the
  // latest annual EPS (falling back to the last fiscal-year-end ratio).
  const latestEps = f.income[0]?.eps ?? NaN;
  const currentPe = f.quote.price > 0 && latestEps > 0 ? f.quote.price / latestEps : f.ratios[0]?.priceToEarningsRatio ?? NaN;
  const sectorPe = SECTOR_AVG_PE[f.profile.sector] ?? DEFAULT_SECTOR_PE;

  const epsCagr = seriesCagr([...f.income].reverse().map((i) => ({ date: i.date, value: i.eps })));
  const peg = currentPe > 0 && epsCagr > 0 ? currentPe / (epsCagr * 100) : NaN;

  const eps = f.income[0]?.eps ?? NaN;
  const bvps = f.ratios[0]?.bookValuePerShare ?? NaN;
  const grahamNumber = eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : NaN;
  const price = f.quote.price;

  const peBenchmark = Math.min(peOwnAvg || sectorPe, sectorPe);

  // The line between missing and bad matters most on this axis. A company
  // losing money has no meaningful P/E — but that is an answer, and excusing
  // it would let loss-makers skip the valuation tests that should mark them
  // down. So these are unavailable only when the inputs themselves are absent:
  // no price, or no earnings figure at all.
  const pricedAndReported = price > 0 && Number.isFinite(latestEps);

  return [
    Number.isFinite(iv.intrinsicValuePerShare) && Number.isFinite(iv.marginOfSafety)
      ? criterion("valuation", "marginOfSafety", iv.marginOfSafety >= 0.25, linScore(iv.marginOfSafety, 0, 0.25, 40), 40, {
          intrinsicValuePerShare: iv.intrinsicValuePerShare,
          currentPrice: iv.currentPrice,
          marginOfSafety: iv.marginOfSafety,
        })
      : unavailable("valuation", "marginOfSafety", 40, {
          intrinsicValuePerShare: iv.intrinsicValuePerShare,
          currentPrice: iv.currentPrice,
          marginOfSafety: iv.marginOfSafety,
        }),
    pricedAndReported
      ? criterion(
          "valuation",
          "peRelative",
          currentPe > 0 && currentPe < peBenchmark,
          currentPe > 0 ? linScore(currentPe, peBenchmark * 0.6, peBenchmark, 25, false) : 0,
          25,
          { currentPe, peOwnAvg, sectorPe },
        )
      : unavailable("valuation", "peRelative", 25, { currentPe, peOwnAvg, sectorPe }),
    pricedAndReported
      ? criterion("valuation", "peg", Number.isFinite(peg) && peg < 1, linScore(peg, 1.0, 2.0, 20, false), 20, { peg })
      : unavailable("valuation", "peg", 20, { peg }),
    pricedAndReported && Number.isFinite(bvps)
      ? criterion(
          "valuation",
          "grahamNumber",
          Number.isFinite(grahamNumber) && price <= grahamNumber,
          Number.isFinite(grahamNumber) ? linScore(price / grahamNumber, 0.7, 1.2, 15, false) : 0,
          15,
          { price, grahamNumber },
        )
      : unavailable("valuation", "grahamNumber", 15, { price, grahamNumber }),
  ];
}

// Exported so the dashboard's custom-weight recompute (lib/customWeights.ts)
// applies the same bar to a user-chosen blend that the default scoring uses —
// a company shouldn't qualify under someone's weights by a rule that's
// secretly different from the one described on screen.
export const BUY_CANDIDATE_THRESHOLD = 70;

// Below this share of an axis's points, the axis is graded against this share
// anyway rather than being scaled up from what little was measured.
const MIN_MEASURED_SHARE = 0.5;

// Calling something a Buy Candidate is the one place this makes a
// recommendation rather than a measurement, so it needs the evidence to back
// it: an axis we could barely read is not grounds for either recommending or
// rejecting, and shouldn't be presented as the former.
export const MIN_COVERAGE_FOR_BUY = 0.7;

export function scoreTicker(f: TickerFinancials, asOf = new Date().toISOString()): StockScore {
  const intrinsicValue = computeIntrinsicValue(f);
  const criteria = [
    ...scoreQuality(f),
    ...scoreGrowth(f),
    ...scoreHealth(f),
    ...scoreConsistency(f),
    ...scoreValuation(f, intrinsicValue),
  ];

  // Each axis is graded out of the criteria that could actually be measured,
  // then rescaled to 100. Where every criterion is measurable — the great
  // majority — the axis maxPoints already sum to 100 and this is exactly the
  // old sum. Where some aren't, the alternative would be to score the missing
  // ones zero, which reads as "measured, and terrible" for what is really our
  // inability to read the filing.
  const axisScore = (axis: ScoreAxis) => {
    const measured = criteria.filter((c) => c.axis === axis && c.available !== false);
    const max = measured.reduce((sum, c) => sum + c.maxPoints, 0);
    const got = measured.reduce((sum, c) => sum + c.points, 0);
    const total = criteria.filter((c) => c.axis === axis).reduce((sum, c) => sum + c.maxPoints, 0);
    // Rescaling assumes what we measured stands in for what we didn't, which
    // holds while most of the axis is measured and stops holding well before
    // the end. Berkshire's balance sheet yields one of five health criteria;
    // scaled up, a single good interest-coverage reading became a health score
    // of 100. Past the halfway mark the axis is graded against half its points
    // regardless, so a thin sample caps out low rather than extrapolating.
    const denominator = Math.max(max, total * MIN_MEASURED_SHARE);
    return { score: denominator > 0 ? round1((got / denominator) * 100) : 0, coverage: total > 0 ? max / total : 0 };
  };

  const graded = Object.fromEntries(SCORE_AXES.map((axis) => [axis, axisScore(axis)])) as Record<
    ScoreAxis,
    { score: number; coverage: number }
  >;
  const scores = Object.fromEntries(SCORE_AXES.map((axis) => [axis, graded[axis].score])) as AxisScores;
  const coverage = Object.fromEntries(
    SCORE_AXES.map((axis) => [axis, Math.round(graded[axis].coverage * 100) / 100]),
  ) as AxisCoverage;

  const totalScore = round1(SCORE_AXES.reduce((sum, axis) => sum + scores[axis] * AXIS_WEIGHTS[axis], 0));

  return {
    ticker: f.ticker,
    companyName: f.profile.companyName,
    sector: f.profile.sector,
    price: f.quote.price,
    marketCap: f.quote.marketCap,
    scores,
    coverage,
    totalScore,
    isBuyCandidate:
      totalScore >= BUY_CANDIDATE_THRESHOLD &&
      intrinsicValue.marginOfSafety > 0 &&
      SCORE_AXES.every((axis) => coverage[axis] >= MIN_COVERAGE_FOR_BUY),
    intrinsicValue,
    criteria,
    dataSource: f.dataSource,
    asOf,
    scoringVersion: SCORING_VERSION,
  };
}

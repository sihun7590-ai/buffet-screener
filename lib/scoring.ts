import {
  AXIS_WEIGHTS,
  SCORE_AXES,
  type AxisScores,
  type CriterionResult,
  type IntrinsicValueEstimate,
  type ScoreAxis,
  type StockScore,
  type TickerFinancials,
} from "./types";

// Bump when the formula changes. Stored on every score so a history chart can
// distinguish "the company changed" from "we changed how we measure".
export const SCORING_VERSION = 2;

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

// Compound growth across a full oldest→newest series, capped at 5 years of
// look-back so one distant outlier year can't define the trend.
function seriesCagr(ascending: number[], maxYears = 5): number {
  const usable = ascending.filter(Number.isFinite);
  const span = Math.min(maxYears, usable.length - 1);
  if (span <= 0) return NaN;
  return cagr(usable[usable.length - 1 - span], usable[usable.length - 1], span);
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

export function computeIntrinsicValue(f: TickerFinancials): IntrinsicValueEstimate {
  const cashFlows = [...f.cashFlow].reverse(); // oldest -> newest
  // capitalExpenditure is stored as a negative outflow, so FCF = OCF + capex.
  const fcfHistory = cashFlows.map((c) => c.freeCashFlow ?? c.operatingCashFlow + c.capitalExpenditure);
  const recent = fcfHistory.slice(-3);
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
    criterion("quality", "roe", roeAvg >= 0.15, linScore(roeAvg, 0.08, 0.15, 28), 28, { roeAvg }),
    criterion("quality", "roic", roicAvg >= 0.12, linScore(roicAvg, 0.06, 0.12, 28), 28, { roicAvg }),
    criterion(
      "quality",
      "grossMargin",
      hasMarginData && marginAvg >= 0.35 && stabilityPenalty < 0.15,
      hasMarginData ? linScore(marginAvg, 0.2, 0.45, 11) + linScore(stabilityPenalty, 0.05, 0.25, 5, false) : 0,
      16,
      { marginAvg, stabilityPenalty },
    ),
    criterion("quality", "operatingMargin", operatingMargin >= 0.15, linScore(operatingMargin, 0.05, 0.2, 10), 10, {
      operatingMargin,
    }),
    criterion("quality", "fcfMargin", fcfMargin >= 0.1, linScore(fcfMargin, 0.05, 0.2, 10), 10, { fcfMargin }),
    criterion("quality", "shareCount", shareCountDelta > 0, linScore(shareCountDelta, -0.05, 0.1, 8), 8, {
      shareCountDelta,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Growth — is the business getting bigger? (100 pts)
// ---------------------------------------------------------------------------
function scoreGrowth(f: TickerFinancials): CriterionResult[] {
  const incomeAsc = [...f.income].reverse();
  const cashFlowAsc = [...f.cashFlow].reverse();

  const revenueCagr = seriesCagr(incomeAsc.map((i) => i.revenue));
  const epsCagr = seriesCagr(incomeAsc.map((i) => i.eps));
  const fcfCagr = seriesCagr(cashFlowAsc.map((c) => c.freeCashFlow));

  return [
    criterion("growth", "revenueCagr", revenueCagr >= 0.05, linScore(revenueCagr, 0, 0.1, 35), 35, { revenueCagr }),
    criterion("growth", "epsCagr", epsCagr >= 0.05, linScore(epsCagr, 0, 0.1, 35), 35, { epsCagr }),
    criterion("growth", "fcfCagr", fcfCagr >= 0.05, linScore(fcfCagr, 0, 0.1, 30), 30, { fcfCagr }),
  ];
}

// ---------------------------------------------------------------------------
// Financial Health — can it survive a bad year? (100 pts)
// ---------------------------------------------------------------------------
function scoreHealth(f: TickerFinancials): CriterionResult[] {
  const debtEquity = f.ratios[0]?.debtToEquityRatio ?? NaN;
  const interestCoverage = f.ratios[0]?.interestCoverageRatio ?? NaN;
  const currentRatio = f.ratios[0]?.currentRatio ?? NaN;

  const debt = f.balance[0]?.totalDebt ?? NaN;
  const cash = f.balance[0]?.cashAndCashEquivalents ?? NaN;
  const ebitda = f.income[0]?.ebitda ?? NaN;

  // A debt-free balance sheet is the best possible answer to both of these,
  // not a missing one — treat it as such instead of scoring a NaN ratio 0.
  const debtFree = Number.isFinite(debt) && debt <= 0;
  const netDebtToEbitda = debtFree ? 0 : Number.isFinite(debt) && Number.isFinite(cash) && ebitda > 0 ? (debt - cash) / ebitda : NaN;
  const cashToDebt = debtFree ? Infinity : Number.isFinite(cash) && debt > 0 ? cash / debt : NaN;

  return [
    criterion("health", "debtToEquity", debtEquity <= 0.5, linScore(debtEquity, 0.3, 1.0, 30, false), 30, { debtEquity }),
    criterion("health", "interestCoverage", interestCoverage >= 5, linScore(interestCoverage, 2, 8, 25), 25, {
      interestCoverage,
    }),
    criterion("health", "currentRatio", currentRatio >= 1.5, linScore(currentRatio, 1.0, 1.5, 20), 20, { currentRatio }),
    criterion(
      "health",
      "netDebtToEbitda",
      netDebtToEbitda <= 3,
      linScore(netDebtToEbitda, 0, 3, 15, false),
      15,
      { netDebtToEbitda },
    ),
    criterion(
      "health",
      "cashToDebt",
      cashToDebt >= 0.5,
      debtFree ? 10 : linScore(cashToDebt, 0.1, 0.5, 10),
      10,
      { cashToDebt: debtFree ? Infinity : cashToDebt },
    ),
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
    criterion(
      "consistency",
      "epsPositiveYears",
      totalYears > 0 && lossYears === 0,
      totalYears > 0 ? linScore(lossYears, 0, 3, 40, false) : 0,
      40,
      { lossYears, totalYears },
    ),
    criterion(
      "consistency",
      "fcfPositiveYears",
      fcfYears > 0 && fcfPositiveYears === fcfYears,
      linScore(fcfPositiveRatio, 0.5, 1.0, 35),
      35,
      { fcfPositiveYears, totalYears: fcfYears },
    ),
    criterion("consistency", "revenueConsistency", revenueGrowthRatio >= 0.8, linScore(revenueGrowthRatio, 0.5, 1.0, 25), 25, {
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

  const epsCagr = seriesCagr([...f.income].reverse().map((i) => i.eps));
  const peg = currentPe > 0 && epsCagr > 0 ? currentPe / (epsCagr * 100) : NaN;

  const eps = f.income[0]?.eps ?? NaN;
  const bvps = f.ratios[0]?.bookValuePerShare ?? NaN;
  const grahamNumber = eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : NaN;
  const price = f.quote.price;

  const peBenchmark = Math.min(peOwnAvg || sectorPe, sectorPe);

  return [
    criterion("valuation", "marginOfSafety", iv.marginOfSafety >= 0.25, linScore(iv.marginOfSafety, 0, 0.25, 40), 40, {
      intrinsicValuePerShare: iv.intrinsicValuePerShare,
      currentPrice: iv.currentPrice,
      marginOfSafety: iv.marginOfSafety,
    }),
    criterion(
      "valuation",
      "peRelative",
      Number.isFinite(currentPe) && currentPe > 0 && currentPe < peBenchmark,
      Number.isFinite(currentPe) && currentPe > 0 ? linScore(currentPe, peBenchmark * 0.6, peBenchmark, 25, false) : 0,
      25,
      { currentPe, peOwnAvg, sectorPe },
    ),
    criterion("valuation", "peg", Number.isFinite(peg) && peg < 1, linScore(peg, 1.0, 2.0, 20, false), 20, { peg }),
    criterion(
      "valuation",
      "grahamNumber",
      Number.isFinite(grahamNumber) && price <= grahamNumber,
      Number.isFinite(grahamNumber) ? linScore(price / grahamNumber, 0.7, 1.2, 15, false) : 0,
      15,
      { price, grahamNumber },
    ),
  ];
}

const BUY_CANDIDATE_THRESHOLD = 70;

export function scoreTicker(f: TickerFinancials, asOf = new Date().toISOString()): StockScore {
  const intrinsicValue = computeIntrinsicValue(f);
  const criteria = [
    ...scoreQuality(f),
    ...scoreGrowth(f),
    ...scoreHealth(f),
    ...scoreConsistency(f),
    ...scoreValuation(f, intrinsicValue),
  ];

  const scores = Object.fromEntries(
    SCORE_AXES.map((axis) => {
      const items = criteria.filter((c) => c.axis === axis);
      return [axis, round1(items.reduce((sum, c) => sum + c.points, 0))];
    }),
  ) as AxisScores;

  const totalScore = round1(SCORE_AXES.reduce((sum, axis) => sum + scores[axis] * AXIS_WEIGHTS[axis], 0));

  return {
    ticker: f.ticker,
    companyName: f.profile.companyName,
    sector: f.profile.sector,
    price: f.quote.price,
    marketCap: f.quote.marketCap,
    scores,
    totalScore,
    isBuyCandidate: totalScore >= BUY_CANDIDATE_THRESHOLD && intrinsicValue.marginOfSafety > 0,
    intrinsicValue,
    criteria,
    asOf,
    scoringVersion: SCORING_VERSION,
  };
}

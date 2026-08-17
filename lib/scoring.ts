import type { CriterionResult, IntrinsicValueEstimate, StockScore, TickerFinancials } from "./types";

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

  const growthSampleYears = Math.min(5, fcfHistory.length - 1);
  const rawGrowth =
    growthSampleYears > 0
      ? cagr(fcfHistory[fcfHistory.length - 1 - growthSampleYears], fcfHistory[fcfHistory.length - 1], growthSampleYears)
      : 0;
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

function scoreQuality(f: TickerFinancials): CriterionResult[] {
  const roeHistory = f.keyMetrics.slice(0, 5).map((k) => k.returnOnEquity).filter(Number.isFinite);
  const roeAvg = average(roeHistory);
  const roicHistory = f.keyMetrics.slice(0, 5).map((k) => k.returnOnInvestedCapital).filter(Number.isFinite);
  const roicAvg = average(roicHistory);
  const marginHistory = f.ratios.slice(0, 5).map((r) => r.grossProfitMargin).filter(Number.isFinite);
  const marginAvg = average(marginHistory);
  const marginStdev = stdev(marginHistory);
  const debtEquity = f.ratios[0]?.debtToEquityRatio ?? NaN;
  const interestCoverage = f.ratios[0]?.interestCoverageRatio ?? NaN;

  const incomeAsc = [...f.income].reverse();
  const lossYears = incomeAsc.filter((i) => i.netIncome < 0).length;
  const epsTrendYears = Math.min(5, incomeAsc.length - 1);
  const epsCagr =
    epsTrendYears > 0
      ? cagr(incomeAsc[incomeAsc.length - 1 - epsTrendYears].eps, incomeAsc[incomeAsc.length - 1].eps, epsTrendYears)
      : 0;

  const cashFlowAsc = [...f.cashFlow].reverse();
  const fcfHistory = cashFlowAsc.map((c) => c.freeCashFlow ?? c.operatingCashFlow - c.capitalExpenditure);
  const fcfPositiveYears = fcfHistory.filter((v) => v > 0).length;
  const latestRevenue = f.income[0]?.revenue || 1;
  const fcfMargin = (fcfHistory[fcfHistory.length - 1] ?? 0) / latestRevenue;

  const sharesAsc = incomeAsc.map((i) => i.weightedAverageShsOutDil).filter(Number.isFinite);
  const shareCountDelta =
    sharesAsc.length >= 2 ? (sharesAsc[0] - sharesAsc[sharesAsc.length - 1]) / sharesAsc[0] : 0; // positive = shrinking

  const currentRatio = f.ratios[0]?.currentRatio ?? NaN;

  const results: CriterionResult[] = [];

  const roePts = linScore(roeAvg, 0.08, 0.15, 8);
  results.push({
    id: "roe",
    passed: roeAvg >= 0.15,
    points: Math.round(roePts * 10) / 10,
    maxPoints: 8,
    values: { roeAvg },
  });

  const roicPts = linScore(roicAvg, 0.06, 0.12, 7);
  results.push({
    id: "roic",
    passed: roicAvg >= 0.12,
    points: Math.round(roicPts * 10) / 10,
    maxPoints: 7,
    values: { roicAvg },
  });

  const stabilityPenalty = marginStdev / (marginAvg || 1);
  const marginPts = linScore(marginAvg, 0.2, 0.45, 4) + linScore(stabilityPenalty, 0.05, 0.25, 2, false);
  results.push({
    id: "grossMargin",
    passed: marginAvg >= 0.35 && stabilityPenalty < 0.15,
    points: Math.round(Math.min(6, marginPts) * 10) / 10,
    maxPoints: 6,
    values: { marginAvg, stabilityPenalty },
  });

  const debtPts = linScore(debtEquity, 0.3, 1.0, 4, false) + linScore(interestCoverage, 2, 8, 3);
  results.push({
    id: "debt",
    passed: debtEquity <= 0.5 && interestCoverage >= 5,
    points: Math.round(Math.min(7, debtPts) * 10) / 10,
    maxPoints: 7,
    values: { debtEquity, interestCoverage },
  });

  const epsPts = (lossYears === 0 ? 4 : linScore(lossYears, 3, 0, 4, false)) + linScore(epsCagr, 0, 0.1, 3);
  results.push({
    id: "epsConsistency",
    passed: lossYears === 0 && epsCagr > 0,
    points: Math.round(Math.min(7, epsPts) * 10) / 10,
    maxPoints: 7,
    values: { lossYears, epsCagr },
  });

  const fcfPts = linScore(fcfPositiveYears, 3, cashFlowAsc.length || 5, 4) + linScore(fcfMargin, 0.05, 0.2, 2);
  results.push({
    id: "fcf",
    passed: fcfPositiveYears === cashFlowAsc.length && fcfMargin >= 0.1,
    points: Math.round(Math.min(6, fcfPts) * 10) / 10,
    maxPoints: 6,
    values: { fcfPositiveYears, totalYears: cashFlowAsc.length, fcfMargin },
  });

  const sharePts = linScore(shareCountDelta, -0.05, 0.1, 5);
  results.push({
    id: "shareCount",
    passed: shareCountDelta > 0,
    points: Math.round(sharePts * 10) / 10,
    maxPoints: 5,
    values: { shareCountDelta },
  });

  const currentRatioPts = linScore(currentRatio, 1.0, 1.5, 4);
  results.push({
    id: "currentRatio",
    passed: currentRatio >= 1.5,
    points: Math.round(currentRatioPts * 10) / 10,
    maxPoints: 4,
    values: { currentRatio },
  });

  return results;
}

function scoreValuation(f: TickerFinancials, iv: IntrinsicValueEstimate): CriterionResult[] {
  const peHistory = f.ratios.slice(0, 5).map((r) => r.priceToEarningsRatio).filter((v) => Number.isFinite(v) && v > 0);
  const peOwnAvg = average(peHistory);
  // FMP's live quote no longer includes pe/eps, so derive current P/E from
  // today's price against the latest annual EPS (falls back to the last
  // fiscal-year-end ratio if EPS is unusable).
  const latestEps = f.income[0]?.eps ?? NaN;
  const currentPe = f.quote.price > 0 && latestEps > 0 ? f.quote.price / latestEps : f.ratios[0]?.priceToEarningsRatio ?? NaN;
  const sectorPe = SECTOR_AVG_PE[f.profile.sector] ?? DEFAULT_SECTOR_PE;

  const incomeAsc = [...f.income].reverse();
  const epsTrendYears = Math.min(5, incomeAsc.length - 1);
  const epsCagr =
    epsTrendYears > 0
      ? cagr(incomeAsc[incomeAsc.length - 1 - epsTrendYears].eps, incomeAsc[incomeAsc.length - 1].eps, epsTrendYears)
      : 0;
  const peg = currentPe > 0 && epsCagr > 0 ? currentPe / (epsCagr * 100) : NaN;

  const eps = f.income[0]?.eps ?? NaN;
  const bvps = f.ratios[0]?.bookValuePerShare ?? NaN;
  const grahamNumber = eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : NaN;
  const price = f.quote.price;

  const results: CriterionResult[] = [];

  const peBenchmark = Math.min(peOwnAvg || sectorPe, sectorPe);
  const pePts = Number.isFinite(currentPe) && currentPe > 0 ? linScore(currentPe, peBenchmark * 0.6, peBenchmark, 10, false) : 0;
  results.push({
    id: "peRelative",
    passed: Number.isFinite(currentPe) && currentPe > 0 && currentPe < peBenchmark,
    points: Math.round(pePts * 10) / 10,
    maxPoints: 10,
    values: { currentPe, peOwnAvg, sectorPe },
  });

  const pegPts = Number.isFinite(peg) ? linScore(peg, 1.0, 2.0, 8, false) : 0;
  results.push({
    id: "peg",
    passed: Number.isFinite(peg) && peg < 1,
    points: Math.round(pegPts * 10) / 10,
    maxPoints: 8,
    values: { peg },
  });

  const grahamPts = Number.isFinite(grahamNumber) ? linScore(price / grahamNumber, 0.7, 1.2, 8, false) : 0;
  results.push({
    id: "grahamNumber",
    passed: Number.isFinite(grahamNumber) && price <= grahamNumber,
    points: Math.round(grahamPts * 10) / 10,
    maxPoints: 8,
    values: { price, grahamNumber },
  });

  const mosPts = linScore(iv.marginOfSafety, 0, 0.25, 24);
  results.push({
    id: "marginOfSafety",
    passed: iv.marginOfSafety >= 0.25,
    points: Math.round(mosPts * 10) / 10,
    maxPoints: 24,
    values: { intrinsicValuePerShare: iv.intrinsicValuePerShare, currentPrice: iv.currentPrice, marginOfSafety: iv.marginOfSafety },
  });

  return results;
}

const BUY_CANDIDATE_THRESHOLD = 70;

export function scoreTicker(f: TickerFinancials, asOf = new Date().toISOString()): StockScore {
  const intrinsicValue = computeIntrinsicValue(f);
  const quality = scoreQuality(f);
  const valuation = scoreValuation(f, intrinsicValue);

  const qualityScore = Math.round(quality.reduce((sum, c) => sum + c.points, 0) * 10) / 10;
  const valuationScore = Math.round(valuation.reduce((sum, c) => sum + c.points, 0) * 10) / 10;
  const totalScore = Math.round((qualityScore + valuationScore) * 10) / 10;

  return {
    ticker: f.ticker,
    companyName: f.profile.companyName,
    sector: f.profile.sector,
    price: f.quote.price,
    marketCap: f.quote.marketCap,
    qualityScore,
    valuationScore,
    totalScore,
    isBuyCandidate: totalScore >= BUY_CANDIDATE_THRESHOLD && intrinsicValue.marginOfSafety > 0,
    intrinsicValue,
    criteria: [...quality, ...valuation],
    asOf,
  };
}

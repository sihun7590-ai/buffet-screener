import type { CriterionResult, IntrinsicValueEstimate, StockScore, TickerFinancials } from "./types";

// Rough sector P/E benchmarks for the "cheaper than its sector" check.
// FMP's free tier doesn't expose a sector-average endpoint, so this is a
// static approximation — good enough as a sanity check, not a precise index.
const SECTOR_AVG_PE: Record<string, number> = {
  Technology: 28,
  "Communication Services": 22,
  "Consumer Cyclical": 24,
  "Consumer Defensive": 21,
  Healthcare: 24,
  Financial: 14,
  "Financial Services": 14,
  Industrials: 20,
  Energy: 12,
  Utilities: 18,
  "Basic Materials": 16,
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
  const t = (value - low) / (high - low);
  const clamped = Math.min(1, Math.max(0, t));
  return (higherIsBetter ? clamped : 1 - clamped) * maxPoints;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function computeIntrinsicValue(f: TickerFinancials): IntrinsicValueEstimate {
  const cashFlows = [...f.cashFlow].reverse(); // oldest -> newest
  const fcfHistory = cashFlows.map((c) => c.freeCashFlow ?? c.operatingCashFlow - c.capitalExpenditure);
  const recent = fcfHistory.slice(-3);
  const shares = f.income[0]?.weightedAverageShsOutDil || 1;

  const ownerEarningsPerShare = average(recent) / shares;

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
  const marginOfSafety = intrinsicValuePerShare > 0 ? (intrinsicValuePerShare - currentPrice) / intrinsicValuePerShare : -1;

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
  const roeHistory = f.ratios.slice(0, 5).map((r) => r.returnOnEquity).filter(Number.isFinite);
  const roeAvg = average(roeHistory);
  const roicHistory = f.keyMetrics.slice(0, 5).map((k) => k.roic).filter(Number.isFinite);
  const roicAvg = average(roicHistory);
  const marginHistory = f.ratios.slice(0, 5).map((r) => r.grossProfitMargin).filter(Number.isFinite);
  const marginAvg = average(marginHistory);
  const marginStdev = stdev(marginHistory);
  const debtEquity = f.ratios[0]?.debtEquityRatio ?? NaN;
  const interestCoverage = f.ratios[0]?.interestCoverage ?? NaN;

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
    label: "자기자본이익률 (ROE) 5년 평균",
    passed: roeAvg >= 0.15,
    points: Math.round(roePts * 10) / 10,
    maxPoints: 8,
    value: Number.isFinite(roeAvg) ? pct(roeAvg) : "N/A",
    threshold: "≥ 15%",
    explanation: "버핏이 가장 중시하는 지표 — 자기자본을 얼마나 효율적으로 굴려 이익을 내는지.",
  });

  const roicPts = linScore(roicAvg, 0.06, 0.12, 7);
  results.push({
    id: "roic",
    label: "투하자본이익률 (ROIC) 5년 평균",
    passed: roicAvg >= 0.12,
    points: Math.round(roicPts * 10) / 10,
    maxPoints: 7,
    value: Number.isFinite(roicAvg) ? pct(roicAvg) : "N/A",
    threshold: "≥ 12%",
    explanation: "부채까지 포함한 전체 자본 대비 수익성 — 경제적 해자(moat)가 있는 기업일수록 높게 유지됨.",
  });

  const stabilityPenalty = marginStdev / (marginAvg || 1);
  const marginPts = linScore(marginAvg, 0.2, 0.45, 4) + linScore(stabilityPenalty, 0.05, 0.25, 2, false);
  results.push({
    id: "grossMargin",
    label: "매출총이익률 수준·안정성",
    passed: marginAvg >= 0.35 && stabilityPenalty < 0.15,
    points: Math.round(Math.min(6, marginPts) * 10) / 10,
    maxPoints: 6,
    value: Number.isFinite(marginAvg) ? `${pct(marginAvg)} (변동성 ${pct(stabilityPenalty)})` : "N/A",
    threshold: "≥ 35%, 변동성 < 15%",
    explanation: "가격결정력이 있는 기업은 매출총이익률이 높고 해마다 크게 흔들리지 않음.",
  });

  const debtPts = linScore(debtEquity, 0.3, 1.0, 4, false) + linScore(interestCoverage, 2, 8, 3);
  results.push({
    id: "debt",
    label: "부채비율 · 이자보상배율",
    passed: debtEquity <= 0.5 && interestCoverage >= 5,
    points: Math.round(Math.min(7, debtPts) * 10) / 10,
    maxPoints: 7,
    value: `D/E ${Number.isFinite(debtEquity) ? debtEquity.toFixed(2) : "N/A"}, 이자보상 ${Number.isFinite(interestCoverage) ? interestCoverage.toFixed(1) + "x" : "N/A"}`,
    threshold: "D/E ≤ 0.5, 이자보상 ≥ 5x",
    explanation: "버핏은 부채가 적은 기업을 선호 — 불황에도 파산 위험이 낮음.",
  });

  const epsPts = (lossYears === 0 ? 4 : linScore(lossYears, 3, 0, 4, false)) + linScore(epsCagr, 0, 0.1, 3);
  results.push({
    id: "epsConsistency",
    label: "EPS 일관성 (최근 10년)",
    passed: lossYears === 0 && epsCagr > 0,
    points: Math.round(Math.min(7, epsPts) * 10) / 10,
    maxPoints: 7,
    value: `적자 ${lossYears}개년, EPS CAGR ${pct(epsCagr)}`,
    threshold: "적자 0개년, 우상향 추세",
    explanation: "버핏의 핵심 원칙 — \"예측 가능한\" 이익을 내는 기업만 산다.",
  });

  const fcfPts = linScore(fcfPositiveYears, 3, cashFlowAsc.length || 5, 4) + linScore(fcfMargin, 0.05, 0.2, 2);
  results.push({
    id: "fcf",
    label: "잉여현금흐름 (FCF)",
    passed: fcfPositiveYears === cashFlowAsc.length && fcfMargin >= 0.1,
    points: Math.round(Math.min(6, fcfPts) * 10) / 10,
    maxPoints: 6,
    value: `${fcfPositiveYears}/${cashFlowAsc.length}개년 흑자, FCF마진 ${pct(fcfMargin)}`,
    threshold: "전 기간 흑자, 마진 ≥ 10%",
    explanation: "회계상 이익이 아니라 실제 현금이 꾸준히 창출되는지가 핵심.",
  });

  const sharePts = linScore(shareCountDelta, -0.05, 0.1, 5);
  results.push({
    id: "shareCount",
    label: "유통주식수 추세 (자사주 매입)",
    passed: shareCountDelta > 0,
    points: Math.round(sharePts * 10) / 10,
    maxPoints: 5,
    value: pct(shareCountDelta),
    threshold: "감소 추세 (자사주 매입)",
    explanation: "주주에게 우호적인 자본배분(자사주 매입)의 신호.",
  });

  const currentRatioPts = linScore(currentRatio, 1.0, 1.5, 4);
  results.push({
    id: "currentRatio",
    label: "유동비율",
    passed: currentRatio >= 1.5,
    points: Math.round(currentRatioPts * 10) / 10,
    maxPoints: 4,
    value: Number.isFinite(currentRatio) ? currentRatio.toFixed(2) : "N/A",
    threshold: "≥ 1.5",
    explanation: "단기 유동성 — 갑작스런 자금 압박에 버틸 수 있는지.",
  });

  return results;
}

function scoreValuation(f: TickerFinancials, iv: IntrinsicValueEstimate): CriterionResult[] {
  const peHistory = f.ratios.slice(0, 5).map((r) => r.priceEarningsRatio).filter((v) => Number.isFinite(v) && v > 0);
  const peOwnAvg = average(peHistory);
  const currentPe = f.quote.pe ?? f.ratios[0]?.priceEarningsRatio ?? NaN;
  const sectorPe = SECTOR_AVG_PE[f.profile.sector] ?? DEFAULT_SECTOR_PE;

  const incomeAsc = [...f.income].reverse();
  const epsTrendYears = Math.min(5, incomeAsc.length - 1);
  const epsCagr =
    epsTrendYears > 0
      ? cagr(incomeAsc[incomeAsc.length - 1 - epsTrendYears].eps, incomeAsc[incomeAsc.length - 1].eps, epsTrendYears)
      : 0;
  const peg = currentPe > 0 && epsCagr > 0 ? currentPe / (epsCagr * 100) : NaN;

  const eps = f.income[0]?.eps ?? NaN;
  const bvps = f.keyMetrics[0]?.bookValuePerShare ?? NaN;
  const grahamNumber = eps > 0 && bvps > 0 ? Math.sqrt(22.5 * eps * bvps) : NaN;
  const price = f.quote.price;

  const results: CriterionResult[] = [];

  const peBenchmark = Math.min(peOwnAvg || sectorPe, sectorPe);
  const pePts = Number.isFinite(currentPe) && currentPe > 0 ? linScore(currentPe, peBenchmark * 0.6, peBenchmark, 10, false) : 0;
  results.push({
    id: "peRelative",
    label: "PER (자체 평균·업종 평균 대비)",
    passed: Number.isFinite(currentPe) && currentPe > 0 && currentPe < peBenchmark,
    points: Math.round(pePts * 10) / 10,
    maxPoints: 10,
    value: `현재 ${Number.isFinite(currentPe) ? currentPe.toFixed(1) : "N/A"} / 자체평균 ${Number.isFinite(peOwnAvg) ? peOwnAvg.toFixed(1) : "N/A"} / 업종평균(추정) ${sectorPe}`,
    threshold: "현재 PER < 두 평균",
    explanation: "이익 대비 얼마나 싼값에 거래되는지를 자체 이력·업종과 비교.",
  });

  const pegPts = Number.isFinite(peg) ? linScore(peg, 1.0, 2.0, 8, false) : 0;
  results.push({
    id: "peg",
    label: "PEG 비율",
    passed: Number.isFinite(peg) && peg < 1,
    points: Math.round(pegPts * 10) / 10,
    maxPoints: 8,
    value: Number.isFinite(peg) ? peg.toFixed(2) : "N/A (이익성장 데이터 부족)",
    threshold: "< 1.0",
    explanation: "성장률 대비 밸류에이션 — 1 미만이면 성장에 비해 저평가로 해석.",
  });

  const grahamPts = Number.isFinite(grahamNumber) ? linScore(price / grahamNumber, 0.7, 1.2, 8, false) : 0;
  results.push({
    id: "grahamNumber",
    label: "그레이엄 넘버 대비 주가",
    passed: Number.isFinite(grahamNumber) && price <= grahamNumber,
    points: Math.round(grahamPts * 10) / 10,
    maxPoints: 8,
    value: Number.isFinite(grahamNumber) ? `현재가 ${price.toFixed(2)} / 그레이엄넘버 ${grahamNumber.toFixed(2)}` : "N/A",
    threshold: "현재가 ≤ 그레이엄 넘버",
    explanation: "√(22.5 × EPS × BVPS) — 그레이엄의 고전적 저평가 상한선.",
  });

  const mosPts = linScore(iv.marginOfSafety, 0, 0.25, 24);
  results.push({
    id: "marginOfSafety",
    label: "안전마진 (DCF 내재가치 기준)",
    passed: iv.marginOfSafety >= 0.25,
    points: Math.round(mosPts * 10) / 10,
    maxPoints: 24,
    value: `내재가치 ${iv.intrinsicValuePerShare.toFixed(2)} / 현재가 ${iv.currentPrice.toFixed(2)} → ${pct(iv.marginOfSafety)}`,
    threshold: "≥ 25%",
    explanation: "소유주이익(Owner Earnings) 기반 단순 DCF로 추정한 내재가치 대비 할인폭 — 그레이엄·버핏 투자의 핵심 원칙.",
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

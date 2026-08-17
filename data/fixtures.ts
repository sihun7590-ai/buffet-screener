// Synthetic sample data used ONLY when no FMP_API_KEY is configured, so the
// app and scoring logic can be exercised end-to-end without a live key.
// Numbers are illustrative approximations, not real financials — the UI
// shows a "샘플 데이터" banner whenever this source is active (see lib/store.ts).
import type { TickerFinancials } from "../lib/types";

interface FixtureConfig {
  ticker: string;
  companyName: string;
  sector: string;
  years: number;
  startRevenue: number;
  revenueGrowth: number;
  netMargin: number;
  grossMargin: number;
  operatingMargin: number;
  roe: number;
  roic: number;
  debtEquity: number;
  currentRatio: number;
  interestCoverage: number;
  sharesOutStart: number;
  shareChangeRate: number; // negative = buybacks (share count shrinks over time)
  peTarget: number; // desired current-year P/E, used to derive the quote price
  peHistoricalAvg: number; // desired ~5yr average P/E shown in the ratios history
}

function buildFixture(cfg: FixtureConfig): TickerFinancials {
  const {
    years, startRevenue, revenueGrowth, netMargin, grossMargin, operatingMargin,
    roe, roic, debtEquity, currentRatio, interestCoverage, sharesOutStart, shareChangeRate,
  } = cfg;

  // Build oldest -> newest, then reverse to match FMP's most-recent-first convention.
  const incomeAsc = [];
  const balanceAsc = [];
  const cashFlowAsc = [];
  const ratiosAsc = [];
  const keyMetricsAsc = [];

  for (let y = 0; y < years; y++) {
    const year = 2016 + y;
    const revenue = startRevenue * (1 + revenueGrowth) ** y;
    const netIncome = revenue * netMargin;
    const operatingIncome = revenue * operatingMargin;
    const equity = netIncome / roe;
    const totalDebt = equity * debtEquity;
    const interestExpense = operatingIncome / interestCoverage;
    const sharesOut = sharesOutStart * (1 + shareChangeRate) ** y;
    const eps = netIncome / sharesOut;
    const da = revenue * 0.04;
    const capex = revenue * 0.05;
    const operatingCashFlow = netIncome + da;
    const freeCashFlow = operatingCashFlow - capex;
    const currentLiabilities = revenue * 0.15;
    const currentAssets = currentLiabilities * currentRatio;
    const bookValuePerShare = equity / sharesOut;

    incomeAsc.push({
      date: `${year}-12-31`, revenue, netIncome, eps, operatingIncome,
      interestExpense, ebitda: operatingIncome + da, weightedAverageShsOutDil: sharesOut,
    });
    balanceAsc.push({
      date: `${year}-12-31`, totalDebt, totalStockholdersEquity: equity,
      totalCurrentAssets: currentAssets, totalCurrentLiabilities: currentLiabilities,
      cashAndCashEquivalents: currentAssets * 0.3,
    });
    cashFlowAsc.push({
      date: `${year}-12-31`, operatingCashFlow, capitalExpenditure: -capex,
      freeCashFlow, depreciationAndAmortization: da,
    });
    ratiosAsc.push({
      date: `${year}-12-31`, currentRatio,
      debtToEquityRatio: totalDebt / equity, grossProfitMargin: grossMargin,
      priceToEarningsRatio: cfg.peHistoricalAvg * (0.95 + 0.02 * y), priceToBookRatio: (cfg.peTarget * eps) / bookValuePerShare,
      interestCoverageRatio: operatingIncome / interestExpense, bookValuePerShare,
    });
    keyMetricsAsc.push({ date: `${year}-12-31`, returnOnEquity: netIncome / equity, returnOnInvestedCapital: roic });
  }

  const income = [...incomeAsc].reverse();
  const balance = [...balanceAsc].reverse();
  const cashFlow = [...cashFlowAsc].reverse();
  const ratios = [...ratiosAsc].reverse();
  const keyMetrics = [...keyMetricsAsc].reverse();

  const latestEps = income[0].eps;
  const price = latestEps * cfg.peTarget;

  return {
    ticker: cfg.ticker,
    profile: {
      symbol: cfg.ticker, companyName: cfg.companyName, sector: cfg.sector,
      industry: cfg.sector, price, marketCap: price * income[0].weightedAverageShsOutDil, beta: 0.9,
    },
    quote: { symbol: cfg.ticker, price, marketCap: price * income[0].weightedAverageShsOutDil },
    income, balance, cashFlow, ratios, keyMetrics,
  };
}

export const FIXTURE_FINANCIALS: TickerFinancials[] = [
  // High quality, still reasonably priced -> should score as a Buy Candidate
  buildFixture({
    ticker: "AAPL", companyName: "Apple Inc. (샘플)", sector: "Information Technology", years: 8,
    startRevenue: 220_000_000_000, revenueGrowth: 0.08, netMargin: 0.24, grossMargin: 0.43,
    operatingMargin: 0.29, roe: 0.32, roic: 0.24, debtEquity: 0.4, currentRatio: 1.6,
    interestCoverage: 12, sharesOutStart: 17_000_000_000, shareChangeRate: -0.03, peTarget: 15, peHistoricalAvg: 22,
  }),
  // High quality, but priced for perfection -> quality high, valuation low
  buildFixture({
    ticker: "KO", companyName: "Coca-Cola Co. (샘플)", sector: "Consumer Staples", years: 8,
    startRevenue: 38_000_000_000, revenueGrowth: 0.05, netMargin: 0.23, grossMargin: 0.6,
    operatingMargin: 0.27, roe: 0.4, roic: 0.15, debtEquity: 0.9, currentRatio: 1.2,
    interestCoverage: 9, sharesOutStart: 4_300_000_000, shareChangeRate: -0.005, peTarget: 27, peHistoricalAvg: 25,
  }),
  // Cheap but mediocre quality (high leverage, thin margins) -> valuation ok, quality weak
  buildFixture({
    ticker: "XOM", companyName: "Exxon Mobil Corp. (샘플)", sector: "Energy", years: 8,
    startRevenue: 260_000_000_000, revenueGrowth: 0.02, netMargin: 0.09, grossMargin: 0.28,
    operatingMargin: 0.13, roe: 0.16, roic: 0.1, debtEquity: 0.7, currentRatio: 1.1,
    interestCoverage: 6, sharesOutStart: 4_200_000_000, shareChangeRate: -0.01, peTarget: 11, peHistoricalAvg: 13,
  }),
  // Solid all-rounder in the middle of the pack
  buildFixture({
    ticker: "JPM", companyName: "JPMorgan Chase & Co. (샘플)", sector: "Financials", years: 8,
    startRevenue: 115_000_000_000, revenueGrowth: 0.06, netMargin: 0.28, grossMargin: 0.55,
    operatingMargin: 0.34, roe: 0.17, roic: 0.09, debtEquity: 1.1, currentRatio: 1.3,
    interestCoverage: 5, sharesOutStart: 3_000_000_000, shareChangeRate: -0.02, peTarget: 9, peHistoricalAvg: 13,
  }),
];

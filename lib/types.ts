// FMP API raw response shapes (only the fields we actually use)

export interface FmpProfile {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  price: number;
  marketCap: number;
  beta: number;
}

export interface FmpQuote {
  symbol: string;
  price: number;
  marketCap: number;
}

export interface FmpIncomeStatement {
  date: string;
  revenue: number;
  netIncome: number;
  eps: number;
  operatingIncome: number;
  interestExpense: number;
  ebitda: number;
  weightedAverageShsOutDil: number;
}

export interface FmpBalanceSheet {
  date: string;
  totalDebt: number;
  totalStockholdersEquity: number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  cashAndCashEquivalents: number;
}

export interface FmpCashFlow {
  date: string;
  operatingCashFlow: number;
  capitalExpenditure: number;
  freeCashFlow: number;
  depreciationAndAmortization: number;
}

export interface FmpRatios {
  date: string;
  currentRatio: number;
  debtToEquityRatio: number;
  grossProfitMargin: number;
  priceToEarningsRatio: number;
  priceToBookRatio: number;
  interestCoverageRatio: number;
  bookValuePerShare: number;
}

export interface FmpKeyMetrics {
  date: string;
  returnOnEquity: number;
  returnOnInvestedCapital: number;
}

// Bundle of everything fetched for one ticker, used as input to the scorer.
export interface TickerFinancials {
  ticker: string;
  profile: FmpProfile;
  quote: FmpQuote;
  income: FmpIncomeStatement[]; // most recent first
  balance: FmpBalanceSheet[];
  cashFlow: FmpCashFlow[];
  ratios: FmpRatios[];
  keyMetrics: FmpKeyMetrics[];
}

// The five things a value investor weighs separately. Keeping them apart is
// the whole point: "a wonderful business at a fair price" and "a fair
// business at a wonderful price" score very differently on quality vs
// valuation, and a single blended number hides which one you're looking at.
export const SCORE_AXES = ["quality", "growth", "health", "consistency", "valuation"] as const;
export type ScoreAxis = (typeof SCORE_AXES)[number];

// Each axis is scored out of 100 on its own, then blended into the overall
// score by these weights.
export const AXIS_WEIGHTS: Record<ScoreAxis, number> = {
  quality: 0.3,
  valuation: 0.25,
  health: 0.2,
  growth: 0.15,
  consistency: 0.1,
};

export type AxisScores = Record<ScoreAxis, number>;

// One scoring criterion. Label/threshold/explanation are NOT stored here —
// those are static per `id` and looked up from the i18n message catalog at
// render time (see lib/criteriaText.ts), so this stays language-neutral and
// safe to cache in data/scores.json. `values` holds whatever raw numbers
// that criterion's display text needs to interpolate (NaN allowed for
// "data unavailable" — rendered as "N/A" by the formatter). `maxPoints` is
// this criterion's share of its own axis's 100 points.
export interface CriterionResult {
  id: string;
  axis: ScoreAxis;
  passed: boolean;
  points: number;
  maxPoints: number;
  values: Record<string, number>;
}

export interface IntrinsicValueEstimate {
  ownerEarningsPerShare: number;
  growthRateUsed: number;
  discountRate: number;
  terminalGrowthRate: number;
  intrinsicValuePerShare: number;
  currentPrice: number;
  marginOfSafety: number; // (IV - price) / IV
}

export interface StockScore {
  ticker: string;
  companyName: string;
  sector: string;
  price: number;
  marketCap: number;
  scores: AxisScores; // each 0-100
  totalScore: number; // weighted blend of the axes, 0-100
  isBuyCandidate: boolean;
  intrinsicValue: IntrinsicValueEstimate;
  criteria: CriterionResult[];
  asOf: string; // ISO date the score snapshot was computed
  // Bumped whenever the formula changes, so a score history chart can tell a
  // step caused by the company apart from one caused by us.
  scoringVersion: number;
}

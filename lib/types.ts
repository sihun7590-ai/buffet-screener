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

// One scoring criterion. Label/threshold/explanation are NOT stored here —
// those are static per `id` and looked up from the i18n message catalog at
// render time (see lib/criteriaText.ts), so this stays language-neutral and
// safe to cache in data/scores.json. `values` holds whatever raw numbers
// that criterion's display text needs to interpolate (NaN allowed for
// "data unavailable" — rendered as "N/A" by the formatter).
export interface CriterionResult {
  id: string;
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
  qualityScore: number; // 0-50
  valuationScore: number; // 0-50
  totalScore: number; // 0-100
  isBuyCandidate: boolean;
  intrinsicValue: IntrinsicValueEstimate;
  criteria: CriterionResult[];
  asOf: string; // ISO date the score snapshot was computed
}

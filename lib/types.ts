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
  pe: number | null;
  eps: number | null;
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
  returnOnEquity: number;
  currentRatio: number;
  debtEquityRatio: number;
  grossProfitMargin: number;
  priceEarningsRatio: number;
  priceToBookRatio: number;
  interestCoverage: number;
}

export interface FmpKeyMetrics {
  date: string;
  roic: number;
  bookValuePerShare: number;
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

// One scoring criterion, shown as-is on the stock detail page.
export interface CriterionResult {
  id: string;
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
  value: string; // human-readable actual value, e.g. "17.2%"
  threshold: string; // human-readable threshold, e.g. "≥ 15%"
  explanation: string;
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

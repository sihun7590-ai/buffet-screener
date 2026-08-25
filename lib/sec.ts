// Builds a TickerFinancials bundle (same shape lib/scoring.ts already
// expects) from two free, keyless sources instead of FMP:
//   - SEC EDGAR XBRL company facts: raw financial-statement line items
//   - Yahoo Finance's unofficial chart endpoint: current + historical prices
//
// Unlike FMP, neither source hands us pre-computed ratios (ROE, ROIC, P/E,
// ...), so this module derives them itself and fills in FmpRatios /
// FmpKeyMetrics per fiscal year, keeping scoring.ts unchanged.
import universe from "../data/universe.json";
import { annualSeries, fetchCompanyFacts, lookupByEnd, type FiscalPoint } from "./xbrl";
import { latestInstant, ttm } from "./quarterly";
import { closeNear, fetchPriceHistory } from "./price";
import type { FmpBalanceSheet, FmpCashFlow, FmpIncomeStatement, FmpKeyMetrics, FmpRatios, TickerFinancials } from "./types";

const YEARS = 8;
// SEC doesn't expose effective tax rate cleanly across companies, so ROIC
// uses the flat US federal statutory rate as a reasonable approximation —
// this is a rough grading signal, not a precise valuation input.
const ASSUMED_TAX_RATE = 0.21;
const REQUEST_DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REVENUE_TAGS = [
  "Revenues",
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "SalesRevenueNet",
  "RevenuesNetOfInterestExpense", // investment banks (e.g. Goldman Sachs)
];
const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss"];
const EPS_DILUTED_TAGS = ["EarningsPerShareDiluted"];
const OPERATING_INCOME_TAGS = ["OperatingIncomeLoss"];
const INTEREST_EXPENSE_TAGS = ["InterestExpense", "InterestExpenseDebt", "InterestAndDebtExpense", "InterestExpenseNonoperating"];
const SHARES_DILUTED_TAGS = ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"];
const GROSS_PROFIT_TAGS = ["GrossProfit"];
const COST_OF_REVENUE_TAGS = ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"];

const CURRENT_ASSETS_TAGS = ["AssetsCurrent"];
const CURRENT_LIABILITIES_TAGS = ["LiabilitiesCurrent"];
const EQUITY_TAGS = ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"];
const CASH_TAGS = ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"];
const LT_DEBT_TAGS = ["LongTermDebtNoncurrent", "LongTermDebt"];
const CURRENT_DEBT_TAGS = ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"];

const OPERATING_CASH_FLOW_TAGS = ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"];
const CAPEX_TAGS = ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsForCapitalImprovements", "PaymentsToAcquireProductiveAssets"];
const DA_TAGS = ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization", "Depreciation"];

const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

// Everything one ticker needs from the network, fetched once. Kept separate
// from the bundle-building below so a backfill can download a company a single
// time and then rebuild its financials at a dozen different past dates from
// the same payload, instead of hammering SEC once per date.
export interface TickerRawData {
  facts: Awaited<ReturnType<typeof fetchCompanyFacts>>;
  priceHistory: Awaited<ReturnType<typeof fetchPriceHistory>>;
}

export async function fetchTickerRawData(ticker: string): Promise<TickerRawData> {
  await sleep(REQUEST_DELAY_MS);
  const [facts, priceHistory] = await Promise.all([fetchCompanyFacts(ticker), fetchPriceHistory(ticker)]);
  return { facts, priceHistory };
}

// Builds the bundle the scorer expects. With `asOf` set, it reflects only what
// had been filed by that date and prices the company at that date's close —
// i.e. what an investor could actually have known then.
export function buildTickerFinancials(ticker: string, raw: TickerRawData, asOf?: string): TickerFinancials {
  const meta = (universe as { ticker: string; companyName: string; sector: string }[]).find((u) => u.ticker === ticker);
  if (!meta) {
    throw new Error(`${ticker}: data/universe.json에 companyName/sector 메타데이터가 없습니다.`);
  }

  const { facts, priceHistory } = raw;
  const annual = (tags: string[], instant: boolean) => annualSeries(facts, tags, instant, asOf);

  const revenue = annual(REVENUE_TAGS, false);
  if (revenue.length === 0) {
    throw new Error(
      asOf
        ? `${ticker}: ${asOf} 시점에 공시된 매출 데이터가 없습니다.`
        : `${ticker}: SEC 재무제표에서 매출 데이터를 찾을 수 없습니다.`,
    );
  }
  const fiscalEnds = revenue.slice(0, YEARS).map((p) => p.end);

  const netIncome = annual(NET_INCOME_TAGS, false);
  const epsDiluted = annual(EPS_DILUTED_TAGS, false);
  const operatingIncome = annual(OPERATING_INCOME_TAGS, false);
  const interestExpense = annual(INTEREST_EXPENSE_TAGS, false);
  const sharesDiluted = annual(SHARES_DILUTED_TAGS, false);
  const grossProfit = annual(GROSS_PROFIT_TAGS, false);
  const costOfRevenue = annual(COST_OF_REVENUE_TAGS, false);

  const currentAssets = annual(CURRENT_ASSETS_TAGS, true);
  const currentLiabilities = annual(CURRENT_LIABILITIES_TAGS, true);
  const equity = annual(EQUITY_TAGS, true);
  const cash = annual(CASH_TAGS, true);
  const ltDebt = annual(LT_DEBT_TAGS, true);
  const currentDebt = annual(CURRENT_DEBT_TAGS, true);

  const operatingCashFlow = annual(OPERATING_CASH_FLOW_TAGS, false);
  const capex = annual(CAPEX_TAGS, false);
  const da = annual(DA_TAGS, false);

  const income: FmpIncomeStatement[] = [];
  const balance: FmpBalanceSheet[] = [];
  const cashFlow: FmpCashFlow[] = [];
  const ratios: FmpRatios[] = [];
  const keyMetrics: FmpKeyMetrics[] = [];

  const at = (series: FiscalPoint[], end: string) => fin(lookupByEnd(series, end));

  for (const end of fiscalEnds) {
    const rev = at(revenue, end);
    const ni = at(netIncome, end);
    const eps = at(epsDiluted, end);
    const opInc = at(operatingIncome, end);
    const intExp = at(interestExpense, end);
    const daVal = at(da, end);

    // Some filers tag WeightedAverageNumberOfDilutedSharesOutstanding in
    // millions without actually scaling the value (e.g. "721.9" instead of
    // 721,900,000) — a known, filer-side XBRL tagging error. Deriving share
    // count from net income / EPS sidesteps it entirely, since both of those
    // facts are reliably scaled.
    const shsDilRaw = at(sharesDiluted, end);
    const shsDil = Number.isFinite(ni) && Number.isFinite(eps) && eps !== 0 ? Math.abs(ni / eps) : shsDilRaw;

    let gp = at(grossProfit, end);
    if (!Number.isFinite(gp)) {
      const cor = at(costOfRevenue, end);
      gp = Number.isFinite(rev) && Number.isFinite(cor) ? rev - cor : NaN;
    }

    income.push({
      date: end,
      revenue: rev,
      netIncome: ni,
      eps,
      operatingIncome: opInc,
      interestExpense: intExp,
      ebitda: Number.isFinite(opInc) && Number.isFinite(daVal) ? opInc + daVal : NaN,
      weightedAverageShsOutDil: shsDil,
    });

    const ca = at(currentAssets, end);
    const cl = at(currentLiabilities, end);
    const eq = at(equity, end);
    const csh = at(cash, end);
    const ltd = at(ltDebt, end);
    const cd = at(currentDebt, end);
    const debt = (Number.isFinite(ltd) ? ltd : 0) + (Number.isFinite(cd) ? cd : 0);

    balance.push({
      date: end,
      totalDebt: debt,
      totalStockholdersEquity: eq,
      totalCurrentAssets: ca,
      totalCurrentLiabilities: cl,
      cashAndCashEquivalents: csh,
    });

    const ocf = at(operatingCashFlow, end);
    const capexRaw = at(capex, end);
    const capexNeg = Number.isFinite(capexRaw) ? -Math.abs(capexRaw) : NaN;
    // Capital-light filers (banks, insurers, REITs, ...) often don't tag
    // PP&E capex at all — treat it as 0 rather than losing FCF entirely.
    const fcf = Number.isFinite(ocf) ? ocf + (Number.isFinite(capexNeg) ? capexNeg : 0) : NaN;

    cashFlow.push({
      date: end,
      operatingCashFlow: ocf,
      capitalExpenditure: capexNeg,
      freeCashFlow: fcf,
      depreciationAndAmortization: daVal,
    });

    const bvps = Number.isFinite(eq) && shsDil > 0 ? eq / shsDil : NaN;
    const priceAtYearEnd = fin(closeNear(priceHistory, end));
    const peAtYearEnd = Number.isFinite(priceAtYearEnd) && Number.isFinite(eps) && eps > 0 ? priceAtYearEnd / eps : NaN;

    ratios.push({
      date: end,
      currentRatio: Number.isFinite(ca) && cl > 0 ? ca / cl : NaN,
      debtToEquityRatio: Number.isFinite(eq) && eq !== 0 ? debt / eq : NaN,
      grossProfitMargin: Number.isFinite(gp) && rev > 0 ? gp / rev : NaN,
      priceToEarningsRatio: peAtYearEnd,
      priceToBookRatio: Number.isFinite(priceAtYearEnd) && bvps > 0 ? priceAtYearEnd / bvps : NaN,
      interestCoverageRatio: Number.isFinite(opInc) && intExp > 0 ? opInc / intExp : NaN,
      bookValuePerShare: bvps,
    });

    const investedCapital = debt + (Number.isFinite(eq) ? eq : 0) - (Number.isFinite(csh) ? csh : 0);
    const nopat = Number.isFinite(opInc) ? opInc * (1 - ASSUMED_TAX_RATE) : NaN;
    keyMetrics.push({
      date: end,
      returnOnEquity: Number.isFinite(ni) && eq !== 0 ? ni / eq : NaN,
      returnOnInvestedCapital: Number.isFinite(nopat) && investedCapital > 0 ? nopat / investedCapital : NaN,
    });
  }

  // Between annual reports every figure here except the share price sits up to
  // a year stale. If quarterly filings carry the story further, prepend a
  // trailing-twelve-month period as the current one so profitability, leverage
  // and growth move with the quarters instead of once a year. Purely additive:
  // a company whose quarters can't be assembled keeps exactly the annual view
  // it had before.
  prependTtmPeriod({ facts, asOf, priceHistory, income, balance, cashFlow, ratios, keyMetrics });

  // At a past date the "current" price is that date's close, not today's.
  const currentPrice = asOf ? closeNear(priceHistory, asOf) : priceHistory.currentPrice;
  const marketCap = currentPrice * income[0].weightedAverageShsOutDil;

  return {
    ticker,
    profile: {
      symbol: ticker,
      companyName: meta.companyName,
      sector: meta.sector,
      industry: meta.sector,
      price: currentPrice,
      marketCap,
      beta: 1,
    },
    quote: { symbol: ticker, price: currentPrice, marketCap },
    income,
    balance,
    cashFlow,
    ratios,
    keyMetrics,
  };
}

export async function fetchTickerFinancials(ticker: string): Promise<TickerFinancials> {
  return buildTickerFinancials(ticker, await fetchTickerRawData(ticker));
}

// Assembles a trailing-twelve-month period from quarterly filings and inserts
// it ahead of the fiscal years, in place. Bails out unless it can build the
// whole period: a half-finished row — a year of revenue against a quarter of
// profit, say — would score worse than no row at all.
function prependTtmPeriod({
  facts,
  asOf,
  priceHistory,
  income,
  balance,
  cashFlow,
  ratios,
  keyMetrics,
}: {
  facts: TickerRawData["facts"];
  asOf?: string;
  priceHistory: TickerRawData["priceHistory"];
  income: FmpIncomeStatement[];
  balance: FmpBalanceSheet[];
  cashFlow: FmpCashFlow[];
  ratios: FmpRatios[];
  keyMetrics: FmpKeyMetrics[];
}) {
  const revenueTtm = ttm(facts, REVENUE_TAGS, asOf);
  const latestFiscalEnd = income[0]?.date ?? "";

  // Nothing newer than the annual report we already have.
  if (!revenueTtm || revenueTtm.fromAnnual || revenueTtm.end <= latestFiscalEnd) return;

  const end = revenueTtm.end;
  const value = (tags: string[]) => {
    const r = ttm(facts, tags, asOf);
    // Only accept figures covering the same window, or the arithmetic mixes
    // periods.
    return r && !r.fromAnnual && r.end === end ? r.value : NaN;
  };

  const ni = value(NET_INCOME_TAGS);
  const opInc = value(OPERATING_INCOME_TAGS);
  const ocf = value(OPERATING_CASH_FLOW_TAGS);
  if (!Number.isFinite(ni) || !Number.isFinite(ocf)) return;

  // Share counts are sometimes tagged in millions without being scaled, so
  // deriving them from net income over EPS — both reliably scaled — is what
  // the annual path does, and the TTM row has to agree or a company's share
  // count appears to collapse between periods.
  const eps = value(EPS_DILUTED_TAGS);
  if (!Number.isFinite(eps) || eps === 0) return;
  const shares = Math.abs(ni / eps);

  // A share count that disagrees wildly with the most recent fiscal year is a
  // tagging problem, not a buyback. Letting it through would divide a year of
  // earnings by the wrong denominator and hand out a fictional intrinsic value.
  const annualShares = income[0]?.weightedAverageShsOutDil;
  if (!Number.isFinite(annualShares) || annualShares <= 0) return;
  if (shares <= 0 || shares / annualShares > 1.5 || shares / annualShares < 0.67) return;

  const eq = latestInstant(facts, EQUITY_TAGS, asOf);
  if (!eq || eq.end !== end) return; // balance sheet must be from the same quarter

  const capexRaw = value(CAPEX_TAGS);
  const capex = Number.isFinite(capexRaw) ? -Math.abs(capexRaw) : NaN;
  const da = value(DA_TAGS);
  const intExp = value(INTEREST_EXPENSE_TAGS);

  let gp = value(GROSS_PROFIT_TAGS);
  if (!Number.isFinite(gp)) {
    const cor = value(COST_OF_REVENUE_TAGS);
    gp = Number.isFinite(cor) ? revenueTtm.value - cor : NaN;
  }

  const sameQuarter = (tags: string[]) => {
    const f = latestInstant(facts, tags, asOf);
    return f && f.end === end ? f.val : NaN;
  };

  const caVal = sameQuarter(CURRENT_ASSETS_TAGS);
  const clVal = sameQuarter(CURRENT_LIABILITIES_TAGS);
  const cashVal = sameQuarter(CASH_TAGS);
  const ltdVal = sameQuarter(LT_DEBT_TAGS);
  const cdVal = sameQuarter(CURRENT_DEBT_TAGS);

  // Treating an untagged balance-sheet line as zero is how a company with
  // $49B of debt ends up scoring as debt-free for a quarter. The annual rows
  // are complete, so anything short of a complete quarter is better left out
  // than mixed in.
  if (!Number.isFinite(ltdVal) && !Number.isFinite(cdVal)) return;
  if (!Number.isFinite(caVal) || !Number.isFinite(clVal)) return;

  const debt = (Number.isFinite(ltdVal) ? ltdVal : 0) + (Number.isFinite(cdVal) ? cdVal : 0);
  const equity = eq.val;

  income.unshift({
    date: end,
    revenue: revenueTtm.value,
    netIncome: ni,
    eps,
    operatingIncome: opInc,
    interestExpense: intExp,
    ebitda: Number.isFinite(opInc) && Number.isFinite(da) ? opInc + da : NaN,
    weightedAverageShsOutDil: shares,
  });

  balance.unshift({
    date: end,
    totalDebt: debt,
    totalStockholdersEquity: equity,
    totalCurrentAssets: caVal,
    totalCurrentLiabilities: clVal,
    cashAndCashEquivalents: cashVal,
  });

  cashFlow.unshift({
    date: end,
    operatingCashFlow: ocf,
    capitalExpenditure: capex,
    freeCashFlow: ocf + (Number.isFinite(capex) ? capex : 0),
    depreciationAndAmortization: da,
  });

  const bvps = Number.isFinite(equity) && shares > 0 ? equity / shares : NaN;
  const priceAtEnd = fin(closeNear(priceHistory, end));

  ratios.unshift({
    date: end,
    currentRatio: Number.isFinite(caVal) && clVal > 0 ? caVal / clVal : NaN,
    debtToEquityRatio: Number.isFinite(equity) && equity !== 0 ? debt / equity : NaN,
    grossProfitMargin: Number.isFinite(gp) && revenueTtm.value > 0 ? gp / revenueTtm.value : NaN,
    priceToEarningsRatio: Number.isFinite(priceAtEnd) && eps > 0 ? priceAtEnd / eps : NaN,
    priceToBookRatio: Number.isFinite(priceAtEnd) && bvps > 0 ? priceAtEnd / bvps : NaN,
    interestCoverageRatio: Number.isFinite(opInc) && intExp > 0 ? opInc / intExp : NaN,
    bookValuePerShare: bvps,
  });

  const investedCapital = debt + (Number.isFinite(equity) ? equity : 0) - (Number.isFinite(cashVal) ? cashVal : 0);
  const nopat = Number.isFinite(opInc) ? opInc * (1 - ASSUMED_TAX_RATE) : NaN;
  keyMetrics.unshift({
    date: end,
    returnOnEquity: Number.isFinite(ni) && equity !== 0 ? ni / equity : NaN,
    returnOnInvestedCapital: Number.isFinite(nopat) && investedCapital > 0 ? nopat / investedCapital : NaN,
  });
}

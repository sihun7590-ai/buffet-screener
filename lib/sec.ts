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
import { closeNear, fetchPriceHistory, type PriceHistory } from "./price";
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

export async function fetchTickerFinancials(ticker: string): Promise<TickerFinancials> {
  const meta = (universe as { ticker: string; companyName: string; sector: string }[]).find((u) => u.ticker === ticker);
  if (!meta) {
    throw new Error(`${ticker}: data/universe.json에 companyName/sector 메타데이터가 없습니다.`);
  }

  await sleep(REQUEST_DELAY_MS);
  const [facts, priceHistory] = await Promise.all([fetchCompanyFacts(ticker), fetchPriceHistory(ticker)]);

  const revenue = annualSeries(facts, REVENUE_TAGS, false);
  if (revenue.length === 0) {
    throw new Error(`${ticker}: SEC 재무제표에서 매출 데이터를 찾을 수 없습니다.`);
  }
  const fiscalEnds = revenue.slice(0, YEARS).map((p) => p.end);

  const netIncome = annualSeries(facts, NET_INCOME_TAGS, false);
  const epsDiluted = annualSeries(facts, EPS_DILUTED_TAGS, false);
  const operatingIncome = annualSeries(facts, OPERATING_INCOME_TAGS, false);
  const interestExpense = annualSeries(facts, INTEREST_EXPENSE_TAGS, false);
  const sharesDiluted = annualSeries(facts, SHARES_DILUTED_TAGS, false);
  const grossProfit = annualSeries(facts, GROSS_PROFIT_TAGS, false);
  const costOfRevenue = annualSeries(facts, COST_OF_REVENUE_TAGS, false);

  const currentAssets = annualSeries(facts, CURRENT_ASSETS_TAGS, true);
  const currentLiabilities = annualSeries(facts, CURRENT_LIABILITIES_TAGS, true);
  const equity = annualSeries(facts, EQUITY_TAGS, true);
  const cash = annualSeries(facts, CASH_TAGS, true);
  const ltDebt = annualSeries(facts, LT_DEBT_TAGS, true);
  const currentDebt = annualSeries(facts, CURRENT_DEBT_TAGS, true);

  const operatingCashFlow = annualSeries(facts, OPERATING_CASH_FLOW_TAGS, false);
  const capex = annualSeries(facts, CAPEX_TAGS, false);
  const da = annualSeries(facts, DA_TAGS, false);

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
    const fcf = Number.isFinite(ocf) && Number.isFinite(capexNeg) ? ocf + capexNeg : NaN;

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

  const currentPrice = priceHistory.currentPrice;
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

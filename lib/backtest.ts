// Backtests the screener's own selection rules against realized forward
// returns, using nothing but numbers that were already public at selection
// time.
//
// Pure functions only — no fetching, no Supabase, no filesystem. Mirrors how
// lib/scoring.ts and lib/peers.ts stay separate from the I/O layer in lib/sec.ts
// and scripts/*.ts: the math here is unit-testable without a network, and the
// script (scripts/backtest.ts) is the only place that touches the outside
// world.
//
// ---------------------------------------------------------------------------
// Why this has no look-ahead bias (the single most important property here):
//
// For a transition from quarter-end T to the next quarter-end T', a
// strategy's holdings are chosen using ONLY fields taken from the T row —
// `total`, `isBuyCandidate`, `price` at T. Those fields were themselves
// computed by the scorer using `annualSeries(facts, tags, instant, asOf: T)`
// (see lib/xbrl.ts), which only admits SEC facts filed on or before T. So the
// selection at T could, in principle, have been made by someone standing at
// T with only the information available that day.
//
// The realized return then divides by the price at T' — a date that, from
// the vantage point of T, is still in the future. Nothing about the return
// calculation ever reaches backward into T' to influence what got selected
// at T. That separation (selection reads only T; return reads T and T') is
// the whole trick, and it's why this produces a real backtest instead of a
// curve-fit.
// ---------------------------------------------------------------------------
//
// Scope limit: only the 14 quarterly *backfilled* rows in score_history are
// used (is_backfilled = true), which line up into 13 consecutive
// quarter-to-quarter transitions (2023-03-31 through 2026-06-30). The 499
// daily "forward" rows (is_backfilled = false) are deliberately ignored for
// now — mixing a quarterly cadence with a daily one would produce ragged,
// incomparable holding periods (some positions held 1 day, others a full
// quarter). As daily forward history accumulates over the coming months and
// years, there will eventually be enough of it to backtest at finer
// granularity too; today there isn't.

export interface QuarterlyScoreRow {
  ticker: string;
  asOf: string; // YYYY-MM-DD, a quarter-end
  total: number;
  isBuyCandidate: boolean;
  price: number | null;
}

export interface BenchmarkQuote {
  asOf: string; // YYYY-MM-DD, must match one of the quarter-end dates
  price: number;
}

export const STRATEGY_IDS = ["buyCandidate", "top20", "universe", "spy"] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

export interface QuarterReturn {
  from: string;
  to: string;
  return: number; // decimal, e.g. 0.05 = +5% for the quarter
  /**
   * Tickers whose return actually fed into this quarter's equal-weight
   * average — i.e. selected at `from` AND priced at both `from` and `to`. Not
   * applicable to the SPY series (always null there).
   */
  holdings: number | null;
}

export interface StrategyResult {
  id: StrategyId;
  quarters: QuarterReturn[];
  /** Equity curve starting at 100 on the first quarter-end, compounding each quarterly return. */
  equityCurve: { asOf: string; value: number }[];
  totalReturn: number; // decimal over the whole period
  cagr: number; // decimal, annualized over the actual sample length
  maxDrawdown: number; // decimal, negative or zero (largest peak-to-trough drop)
  positiveQuarters: number;
  negativeQuarters: number;
  /** Portfolio size range across quarters. Null for SPY (not a portfolio of names). */
  minHoldings: number | null;
  maxHoldings: number | null;
}

export interface BacktestResult {
  generatedAt: string;
  quarterDates: string[]; // sorted ascending
  strategies: StrategyResult[];
}

/** Every quarter-end date present in the backfilled rows, sorted ascending, deduplicated. */
export function quarterDatesFromRows(rows: QuarterlyScoreRow[]): string[] {
  return [...new Set(rows.map((r) => r.asOf))].sort();
}

function isFinitePositive(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

// Equal-weight tickers selected at `from`, priced at both ends, into one
// quarterly return. Returns null holdings/0 return when nothing was priceable
// (kept finite so it never leaks NaN into JSON) rather than throwing — a
// single bad quarter shouldn't take down the whole curve.
function equalWeightReturn(
  selected: string[],
  byTicker: Map<string, QuarterlyScoreRow>,
  nextByTicker: Map<string, QuarterlyScoreRow>,
): { return: number; holdings: number } {
  const legReturns: number[] = [];
  for (const ticker of selected) {
    const priceFrom = byTicker.get(ticker)?.price;
    const priceTo = nextByTicker.get(ticker)?.price;
    if (!isFinitePositive(priceFrom) || !isFinitePositive(priceTo)) continue; // skip: missing either side
    legReturns.push((priceTo - priceFrom) / priceFrom);
  }
  if (legReturns.length === 0) return { return: 0, holdings: 0 };
  const avg = legReturns.reduce((sum, r) => sum + r, 0) / legReturns.length;
  return { return: avg, holdings: legReturns.length };
}

function selectBuyCandidate(rows: QuarterlyScoreRow[]): string[] {
  return rows.filter((r) => r.isBuyCandidate).map((r) => r.ticker);
}

function selectTop20(rows: QuarterlyScoreRow[]): string[] {
  return [...rows]
    .filter((r) => Number.isFinite(r.total))
    .sort((a, b) => b.total - a.total || a.ticker.localeCompare(b.ticker))
    .slice(0, 20)
    .map((r) => r.ticker);
}

function selectUniverse(rows: QuarterlyScoreRow[]): string[] {
  return rows.map((r) => r.ticker);
}

const SELECTORS: Record<Exclude<StrategyId, "spy">, (rows: QuarterlyScoreRow[]) => string[]> = {
  buyCandidate: selectBuyCandidate,
  top20: selectTop20,
  universe: selectUniverse,
};

function buildCurve(dates: string[], quarters: QuarterReturn[]): { asOf: string; value: number }[] {
  const curve: { asOf: string; value: number }[] = [{ asOf: dates[0], value: 100 }];
  let value = 100;
  for (const q of quarters) {
    value *= 1 + q.return;
    curve.push({ asOf: q.to, value });
  }
  return curve;
}

function maxDrawdown(curve: { value: number }[]): number {
  let peak = curve[0]?.value ?? 100;
  let worst = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.value);
    if (peak > 0) worst = Math.min(worst, (point.value - peak) / peak);
  }
  return worst;
}

function summarize(id: StrategyId, dates: string[], quarters: QuarterReturn[]): StrategyResult {
  const equityCurve = buildCurve(dates, quarters);
  const first = equityCurve[0].value;
  const last = equityCurve[equityCurve.length - 1].value;
  const totalReturn = first > 0 ? last / first - 1 : 0;

  const spanDays =
    (new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime() - new Date(`${dates[0]}T00:00:00Z`).getTime()) /
    86_400_000;
  const years = spanDays / 365.25;
  const cagr = years > 0 && first > 0 && last / first > 0 ? Math.pow(last / first, 1 / years) - 1 : 0;

  const holdingsCounts = quarters.map((q) => q.holdings).filter((h): h is number => h !== null);

  return {
    id,
    quarters,
    equityCurve,
    totalReturn: Number.isFinite(totalReturn) ? totalReturn : 0,
    cagr: Number.isFinite(cagr) ? cagr : 0,
    maxDrawdown: maxDrawdown(equityCurve),
    positiveQuarters: quarters.filter((q) => q.return > 0).length,
    negativeQuarters: quarters.filter((q) => q.return <= 0).length,
    minHoldings: holdingsCounts.length ? Math.min(...holdingsCounts) : null,
    maxHoldings: holdingsCounts.length ? Math.max(...holdingsCounts) : null,
  };
}

/**
 * Runs the four baked-in strategies (Buy Candidate, Top 20, equal-weight
 * universe, SPY) across every consecutive pair of quarterly backfilled dates
 * present in `rows`, rebalancing fully at each quarter-end. See the
 * look-ahead-bias note at the top of this file for why this is safe.
 */
export function runBacktest(rows: QuarterlyScoreRow[], spyQuotes: BenchmarkQuote[]): BacktestResult {
  const dates = quarterDatesFromRows(rows);

  const rowsByDate = new Map<string, QuarterlyScoreRow[]>();
  for (const date of dates) rowsByDate.set(date, []);
  for (const row of rows) rowsByDate.get(row.asOf)?.push(row);

  const byDateByTicker = new Map<string, Map<string, QuarterlyScoreRow>>();
  for (const [date, dateRows] of rowsByDate) {
    byDateByTicker.set(date, new Map(dateRows.map((r) => [r.ticker, r])));
  }

  const spyByDate = new Map(spyQuotes.map((q) => [q.asOf, q.price]));

  const strategies: StrategyResult[] = [];

  for (const id of (["buyCandidate", "top20", "universe"] as const)) {
    const quarters: QuarterReturn[] = [];
    for (let i = 0; i < dates.length - 1; i++) {
      const from = dates[i];
      const to = dates[i + 1];
      const selected = SELECTORS[id](rowsByDate.get(from) ?? []);
      const { return: ret, holdings } = equalWeightReturn(
        selected,
        byDateByTicker.get(from)!,
        byDateByTicker.get(to)!,
      );
      quarters.push({ from, to, return: ret, holdings });
    }
    strategies.push(summarize(id, dates, quarters));
  }

  // SPY: same quarter-to-quarter mechanics, but a single price series instead
  // of a selected-and-priced universe of tickers.
  {
    const quarters: QuarterReturn[] = [];
    for (let i = 0; i < dates.length - 1; i++) {
      const from = dates[i];
      const to = dates[i + 1];
      const priceFrom = spyByDate.get(from);
      const priceTo = spyByDate.get(to);
      const ret = isFinitePositive(priceFrom) && isFinitePositive(priceTo) ? (priceTo - priceFrom) / priceFrom : 0;
      quarters.push({ from, to, return: ret, holdings: null });
    }
    strategies.push(summarize("spy", dates, quarters));
  }

  return { generatedAt: new Date().toISOString(), quarterDates: dates, strategies };
}

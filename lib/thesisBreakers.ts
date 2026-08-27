// "Has the reason I bought this stopped being true?"
//
// This is not a price alert. A share falling 30% is information every broker
// already pushes at you, and it says nothing about whether the business changed.
// A breaker is the other thing: a condition you decided in advance would undo
// your reasoning — return on capital slipping under 15%, revenue growth
// stalling, leverage climbing past what you were willing to hold — checked
// against the company's current numbers every time you open the page.
//
// The rules reuse lib/strategy.ts's metric registry rather than defining their
// own. A screen asks "which companies satisfy this?" and a breaker asks "has
// this become true of something I hold?" — the same comparison read in the
// opposite direction. One registry means a rule means the same thing in both
// places, and adding a metric adds it to both at once.
//
// Pure functions only.
import { METRIC_BY_ID, type Operator } from "./strategy";
import type { StockScore } from "./types";

export interface BreakerRule {
  id: string;
  metric: string;
  op: Operator;
  /** Display units, matching the screen builder: percentages as 15, not 0.15. */
  value: number;
}

export interface FiredBreaker {
  rule: BreakerRule;
  ticker: string;
  /** The company's current value for that metric, in display units. */
  actual: number;
}

export interface BreakerReport {
  fired: FiredBreaker[];
  /**
   * Rules that couldn't be checked because this company's filing doesn't carry
   * the figure. Silence from an unanswerable question is the failure mode worth
   * naming: a rule that never fires because the data is missing looks exactly
   * like a rule that never fires because all is well.
   */
  unmeasurable: BreakerRule[];
}

/** Evaluates every rule against one company. */
export function checkBreakers(score: StockScore, rules: BreakerRule[]): BreakerReport {
  const fired: FiredBreaker[] = [];
  const unmeasurable: BreakerRule[] = [];

  for (const rule of rules) {
    const metric = METRIC_BY_ID.get(rule.metric);
    // A rule saved before a metric was renamed. Dropping it silently is better
    // than firing on a metric we can't evaluate.
    if (!metric) continue;

    const raw = metric.extract(score, score.totalScore);
    if (!Number.isFinite(raw)) {
      unmeasurable.push(rule);
      continue;
    }

    const actual = raw * metric.displayScale;
    const broken = rule.op === "gte" ? actual >= rule.value : actual <= rule.value;
    if (broken) fired.push({ rule, ticker: score.ticker, actual });
  }

  return { fired, unmeasurable };
}

export interface TickerBreakers {
  ticker: string;
  companyName: string;
  report: BreakerReport;
}

/**
 * Runs the rules across a set of companies, keeping only those with something
 * to report.
 *
 * Companies are ordered by how many rules broke. Somewhere between "one
 * borderline metric slipped" and "four of your five conditions no longer hold"
 * is the difference between a note and a decision, and the ordering should say
 * which is which before anything is read.
 */
export function checkPortfolioBreakers(scores: StockScore[], rules: BreakerRule[]): TickerBreakers[] {
  if (rules.length === 0) return [];

  return scores
    .map((score) => ({ ticker: score.ticker, companyName: score.companyName, report: checkBreakers(score, rules) }))
    .filter((r) => r.report.fired.length > 0)
    .sort((a, b) => b.report.fired.length - a.report.fired.length);
}

/**
 * Rules worth starting from, phrased as the conditions that would break an
 * ordinary quality-and-value thesis. They are ordinary rules once loaded —
 * every one can be edited or deleted.
 *
 * Measured against the whole snapshot, these fire on 294 of 498 companies. That
 * sounds alarming until you notice what they are for: they run against a
 * watchlist of a handful of companies, not the index, and they mark "go and
 * look at this", not "sell". A set tuned to stay quiet across the S&P 500 would
 * be tuned to stay quiet about Intel, which broke all five.
 */
export const DEFAULT_BREAKER_RULES: Omit<BreakerRule, "id">[] = [
  { metric: "roic", op: "lte", value: 10 },
  { metric: "revenueCagr", op: "lte", value: 0 },
  { metric: "netDebtToEbitda", op: "gte", value: 3 },
  { metric: "operatingMargin", op: "lte", value: 5 },
  { metric: "lossYears", op: "gte", value: 1 },
];

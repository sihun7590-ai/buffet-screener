// User-defined screens: "ROIC over 15% and debt/equity under 0.5 and EPS
// growing more than 10% a year".
//
// The five weight sliders (lib/customWeights.ts) let someone re-blend the axes;
// this is the other half of the same idea — instead of changing how the score
// is composed, it filters on the underlying measurements directly. Both read
// the same finished snapshot and neither touches lib/scoring.ts.
//
// Every metric below is read back out of `criteria`, so a condition on ROIC
// tests the same number the criteria table prints. Nothing is derived twice.
//
// Pure functions only — no fetching, no storage. The browser-local persistence
// lives in the component, the same way the weight sliders work.
import { SCORE_AXES, type ScoreAxis, type StockScore } from "./types";

export type MetricUnit = "percent" | "ratio" | "score" | "currency" | "count";

export interface StrategyMetric {
  id: string;
  unit: MetricUnit;
  /** Raw value straight from the snapshot. NaN when the filing didn't carry it. */
  extract: (s: StockScore, totalScore: number) => number;
  /**
   * Raw is multiplied by this to get the number a person types. Ratios are
   * stored as decimals but read as percentages, and nobody types a market cap
   * in dollars, so these carry the conversion rather than the UI guessing.
   */
  displayScale: number;
  /** Sensible starting value (in display units) when this metric is picked. */
  defaultValue: number;
  /** Which way a person almost always wants to compare it. */
  defaultOp: Operator;
}

export type Operator = "gte" | "lte";

/** Pulls a raw number out of a scored criterion, or NaN if it wasn't measurable. */
function fromCriterion(s: StockScore, criterionId: string, key: string): number {
  const c = s.criteria.find((x) => x.id === criterionId);
  if (!c || c.available === false) return NaN;
  const v = c.values[key];
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}

const axisMetric = (axis: ScoreAxis): StrategyMetric => ({
  id: axis,
  unit: "score",
  extract: (s) => s.scores[axis],
  displayScale: 1,
  defaultValue: 70,
  defaultOp: "gte",
});

const percentMetric = (id: string, criterionId: string, key: string, defaultValue: number): StrategyMetric => ({
  id,
  unit: "percent",
  extract: (s) => fromCriterion(s, criterionId, key),
  displayScale: 100,
  defaultValue,
  defaultOp: "gte",
});

const ratioMetric = (
  id: string,
  criterionId: string,
  key: string,
  defaultValue: number,
  defaultOp: Operator,
): StrategyMetric => ({
  id,
  unit: "ratio",
  extract: (s) => fromCriterion(s, criterionId, key),
  displayScale: 1,
  defaultValue,
  defaultOp,
});

export const STRATEGY_METRICS: StrategyMetric[] = [
  {
    id: "totalScore",
    unit: "score",
    // Takes the total from the caller rather than the snapshot: when someone
    // has moved the weight sliders, a condition on "total score" has to mean
    // the total they can see on screen, not the default blend.
    extract: (_s, totalScore) => totalScore,
    displayScale: 1,
    defaultValue: 70,
    defaultOp: "gte",
  },
  ...SCORE_AXES.map(axisMetric),

  percentMetric("roe", "roe", "roeAvg", 15),
  percentMetric("roic", "roic", "roicAvg", 15),
  percentMetric("grossMargin", "grossMargin", "marginAvg", 35),
  percentMetric("operatingMargin", "operatingMargin", "operatingMargin", 15),
  percentMetric("fcfMargin", "fcfMargin", "fcfMargin", 10),
  percentMetric("revenueCagr", "revenueCagr", "revenueCagr", 5),
  percentMetric("epsCagr", "epsCagr", "epsCagr", 10),
  percentMetric("fcfCagr", "fcfCagr", "fcfCagr", 5),

  ratioMetric("debtToEquity", "debtToEquity", "debtEquity", 0.5, "lte"),
  ratioMetric("interestCoverage", "interestCoverage", "interestCoverage", 5, "gte"),
  ratioMetric("currentRatio", "currentRatio", "currentRatio", 1.5, "gte"),
  ratioMetric("netDebtToEbitda", "netDebtToEbitda", "netDebtToEbitda", 3, "lte"),
  ratioMetric("pe", "peRelative", "currentPe", 25, "lte"),
  ratioMetric("peg", "peg", "peg", 1, "lte"),

  {
    id: "marginOfSafety",
    unit: "percent",
    extract: (s) => s.intrinsicValue?.marginOfSafety ?? NaN,
    displayScale: 100,
    defaultValue: 15,
    defaultOp: "gte",
  },
  {
    id: "lossYears",
    unit: "count",
    extract: (s) => fromCriterion(s, "epsPositiveYears", "lossYears"),
    displayScale: 1,
    defaultValue: 0,
    defaultOp: "lte",
  },
  {
    id: "marketCap",
    unit: "currency",
    extract: (s) => s.marketCap,
    displayScale: 1e-9, // people say "ten billion", not "10000000000"
    defaultValue: 10,
    defaultOp: "gte",
  },
  {
    id: "price",
    unit: "currency",
    extract: (s) => s.price,
    displayScale: 1,
    defaultValue: 100,
    defaultOp: "lte",
  },
];

export const METRIC_BY_ID = new Map(STRATEGY_METRICS.map((m) => [m.id, m]));

export interface Condition {
  /** Stable across re-renders so React keys and edits don't jump rows. */
  key: string;
  metric: string;
  op: Operator;
  /** In display units — percentages as 15, market cap in billions. */
  value: number;
}

export interface StrategyResult {
  matched: StockScore[];
  /**
   * Companies dropped because a condition asked about something their filing
   * doesn't carry. Reported separately from "didn't qualify": a screen that
   * silently discards 80 companies for missing data is telling the reader
   * something quite different from one that rejects them on merit.
   */
  missingData: number;
}

/** True when this stock satisfies the condition. NaN never satisfies anything. */
function passes(s: StockScore, c: Condition, totalScore: number): boolean | "missing" {
  const metric = METRIC_BY_ID.get(c.metric);
  if (!metric) return true; // unknown metric from an older saved strategy — ignore rather than reject everything
  const raw = metric.extract(s, totalScore);
  if (!Number.isFinite(raw)) return "missing";
  const shown = raw * metric.displayScale;
  return c.op === "gte" ? shown >= c.value : shown <= c.value;
}

/**
 * Every stock meeting all conditions. Conditions combine with AND only —
 * an OR builder needs grouping and precedence to be worth anything, and the
 * screens people actually describe ("high return, low debt, reasonable price")
 * are conjunctions.
 */
export function evaluateStrategy(
  scores: StockScore[],
  conditions: Condition[],
  totalOf: (s: StockScore) => number,
): StrategyResult {
  if (conditions.length === 0) return { matched: scores, missingData: 0 };

  const matched: StockScore[] = [];
  let missingData = 0;

  for (const s of scores) {
    const total = totalOf(s);
    let ok = true;
    let missing = false;
    for (const c of conditions) {
      const result = passes(s, c, total);
      if (result === "missing") {
        missing = true;
        ok = false;
        break;
      }
      if (!result) {
        ok = false;
        break;
      }
    }
    if (ok) matched.push(s);
    else if (missing) missingData++;
  }

  return { matched, missingData };
}

export interface SavedStrategy {
  name: string;
  conditions: Condition[];
}

export function isValidConditions(value: unknown): value is Condition[] {
  return (
    Array.isArray(value) &&
    value.every(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as Condition).metric === "string" &&
        ((c as Condition).op === "gte" || (c as Condition).op === "lte") &&
        typeof (c as Condition).value === "number" &&
        Number.isFinite((c as Condition).value),
    )
  );
}

export function isValidSavedStrategies(value: unknown): value is SavedStrategy[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as SavedStrategy).name === "string" &&
        isValidConditions((s as SavedStrategy).conditions),
    )
  );
}

/**
 * Starting points, named by what they're looking for rather than after anyone.
 * These are ordinary conditions — loading one drops it into the builder where
 * every line can be changed or deleted, which is the point of showing them.
 */
export const PRESETS: { id: string; conditions: Omit<Condition, "key">[] }[] = [
  {
    id: "qualityValue",
    conditions: [
      { metric: "roe", op: "gte", value: 15 },
      { metric: "roic", op: "gte", value: 12 },
      { metric: "debtToEquity", op: "lte", value: 0.5 },
      { metric: "marginOfSafety", op: "gte", value: 15 },
    ],
  },
  {
    id: "deepValue",
    conditions: [
      { metric: "pe", op: "lte", value: 15 },
      { metric: "marginOfSafety", op: "gte", value: 25 },
      { metric: "debtToEquity", op: "lte", value: 1 },
      { metric: "lossYears", op: "lte", value: 0 },
    ],
  },
  {
    id: "qualityGrowth",
    conditions: [
      { metric: "roic", op: "gte", value: 15 },
      { metric: "epsCagr", op: "gte", value: 10 },
      { metric: "revenueCagr", op: "gte", value: 5 },
      { metric: "fcfMargin", op: "gte", value: 10 },
    ],
  },
  {
    id: "fortress",
    conditions: [
      { metric: "debtToEquity", op: "lte", value: 0.3 },
      { metric: "currentRatio", op: "gte", value: 1.5 },
      { metric: "interestCoverage", op: "gte", value: 8 },
      { metric: "lossYears", op: "lte", value: 0 },
    ],
  },
];

// The case for and against a company, assembled from the score it already has.
//
// No language model writes any of this, and that is the point rather than a
// compromise. The requirement was that every claim be tied to real data and
// that "no data" be said plainly instead of guessed at — which is exactly what
// a rule reading `criteria` gives you for free, and exactly what a generative
// model has to be policed into. Each point below carries the criterion id it
// came from, so the UI renders the same label, the same measured value and the
// same threshold already shown in the criteria tables. Nothing here can say
// something the score does not.
//
// Pure functions only — no fetching, no Supabase, no filesystem. Same rule as
// lib/scoring.ts and lib/peers.ts.
import { MIN_COVERAGE_FOR_BUY } from "./scoring";
import { AXIS_WEIGHTS, SCORE_AXES, type CriterionResult, type ScoreAxis, type StockScore } from "./types";

// A criterion at or above this share of its own points is being held up as a
// reason to own the company; at or below the lower bound it is a reason not to.
// The band between them is what "What to watch" is made of — close enough to
// the line that the next filing could move it either way.
const BULL_RATIO = 0.75;
const BEAR_RATIO = 0.35;

// Three is the fewest that reads as a case rather than an observation, five the
// most that gets read at all.
const MIN_POINTS = 3;
const MAX_POINTS = 5;

export type ThesisSection = "bull" | "bear" | "risk" | "watch";

/** Structural conditions that aren't a score being low — see `detectRisks`. */
export type RiskId =
  | "negativeEquity"
  | "lossYears"
  | "highLeverage"
  | "negativeOwnerEarnings"
  | "dilution"
  | "aboveIntrinsicValue"
  | "lowCoverage";

export interface ThesisPoint {
  /**
   * The criterion this reads from. The UI looks up `criteria.<id>.label` and
   * formats `values` through lib/criteriaText.ts, so a point can never carry a
   * claim the criteria table doesn't also show.
   */
  criterionId: string;
  axis: ScoreAxis;
  /** Points earned over points available on this criterion, 0-1. */
  ratio: number;
  /**
   * Share of the overall 100-point score this criterion decided. Ranking by it
   * puts "ROE is excellent" (28 quality points at 30% weight) above "cash
   * covers debt" (10 health points at 20%), which is the order they actually
   * mattered in.
   */
  impact: number;
  values: Record<string, number>;
}

export interface ThesisRisk {
  id: RiskId;
  /** Present for `lowCoverage`, which names the axis it's about. */
  axis?: ScoreAxis;
  values: Record<string, number>;
}

export interface Thesis {
  bull: ThesisPoint[];
  bear: ThesisPoint[];
  watch: ThesisPoint[];
  risks: ThesisRisk[];
  /** Axes we could not read well enough to argue either way about. */
  unreadableAxes: ScoreAxis[];
  /**
   * True when neither side reached MIN_POINTS — a company sitting in the middle
   * of every band. Saying so is more honest than padding both lists.
   */
  inconclusive: boolean;
}

const ratioOf = (c: CriterionResult) => (c.maxPoints > 0 ? c.points / c.maxPoints : 0);

/** How much of the final 100 points this criterion was responsible for. */
const impactOf = (c: CriterionResult) => c.maxPoints * AXIS_WEIGHTS[c.axis];

function toPoint(c: CriterionResult): ThesisPoint {
  return { criterionId: c.id, axis: c.axis, ratio: ratioOf(c), impact: impactOf(c), values: c.values };
}

// Ranked by what the criterion decided, not by how extreme it looks. A
// criterion worth 8 points scoring zero is a smaller part of the case against a
// company than one worth 40 scoring poorly, however dramatic the smaller one
// reads.
const byImpact = (a: ThesisPoint, b: ThesisPoint) => b.impact - a.impact;

function numeric(values: Record<string, number>, key: string): number {
  const v = values[key];
  return typeof v === "number" ? v : NaN;
}

function criterionOf(score: StockScore, id: string): CriterionResult | undefined {
  const c = score.criteria.find((x) => x.id === id);
  return c && c.available !== false ? c : undefined;
}

/**
 * Risks are not just "criteria that scored badly" — those are already the bear
 * case. These are conditions that change what the rest of the numbers mean: a
 * balance sheet with no equity left, a discounted-cash-flow model whose input
 * is negative and so cannot be applied at all, an axis too thinly reported to
 * argue about. A company can score well overall and still carry every one of
 * them, which is precisely why they get their own list.
 */
function detectRisks(score: StockScore): ThesisRisk[] {
  const risks: ThesisRisk[] = [];

  const debtToEquity = criterionOf(score, "debtToEquity");
  if (debtToEquity) {
    const equity = numeric(debtToEquity.values, "equity");
    // Buyback-heavy franchises and genuinely distressed companies both land
    // here, and the score can't tell them apart. Flagging it as something to
    // look into is the honest reading; calling it failure would not be.
    if (Number.isFinite(equity) && equity <= 0) risks.push({ id: "negativeEquity", values: { equity } });
  }

  const losses = criterionOf(score, "epsPositiveYears");
  if (losses) {
    const lossYears = numeric(losses.values, "lossYears");
    const totalYears = numeric(losses.values, "totalYears");
    if (lossYears > 0) risks.push({ id: "lossYears", values: { lossYears, totalYears } });
  }

  const leverage = criterionOf(score, "netDebtToEbitda");
  if (leverage) {
    const netDebtToEbitda = numeric(leverage.values, "netDebtToEbitda");
    if (netDebtToEbitda > 3) risks.push({ id: "highLeverage", values: { netDebtToEbitda } });
  }

  const dilutionC = criterionOf(score, "shareCount");
  if (dilutionC) {
    const shareCountDelta = numeric(dilutionC.values, "shareCountDelta");
    // Negative means the count grew: existing holders own a smaller slice than
    // they did, whatever the business did in the meantime.
    if (shareCountDelta < 0) risks.push({ id: "dilution", values: { shareCountDelta } });
  }

  const iv = score.intrinsicValue;
  if (iv) {
    const owner = iv.ownerEarningsPerShare;
    if (Number.isFinite(owner) && owner <= 0) {
      // Regulated utilities routinely spend more on plant than they take in.
      // The model doesn't apply rather than returning a bad answer, and the
      // valuation axis is leaning on its other criteria as a result.
      risks.push({ id: "negativeOwnerEarnings", values: { ownerEarningsPerShare: owner } });
    } else if (Number.isFinite(iv.marginOfSafety) && iv.marginOfSafety < 0) {
      risks.push({ id: "aboveIntrinsicValue", values: { marginOfSafety: iv.marginOfSafety, currentPrice: iv.currentPrice } });
    }
  }

  for (const axis of SCORE_AXES) {
    const covered = score.coverage?.[axis] ?? 1;
    if (covered < MIN_COVERAGE_FOR_BUY) risks.push({ id: "lowCoverage", axis, values: { coverage: covered } });
  }

  return risks;
}

/**
 * Builds the case for and against `score` out of its own criteria.
 *
 * Unmeasured criteria are excluded from every list. A criterion the filing
 * doesn't carry is not evidence for either side, and putting it in the bear
 * case would turn our inability to read a filing into an accusation against
 * the company — the same distinction lib/scoring.ts draws between "unavailable"
 * and "scored zero", carried through to the prose.
 */
export function buildThesis(score: StockScore): Thesis {
  const measured = score.criteria.filter((c) => c.available !== false && Number.isFinite(c.points));

  const bull = measured.filter((c) => ratioOf(c) >= BULL_RATIO).map(toPoint).sort(byImpact).slice(0, MAX_POINTS);
  const bear = measured.filter((c) => ratioOf(c) <= BEAR_RATIO).map(toPoint).sort(byImpact).slice(0, MAX_POINTS);
  const watch = measured
    .filter((c) => {
      const r = ratioOf(c);
      return r > BEAR_RATIO && r < BULL_RATIO;
    })
    .map(toPoint)
    .sort(byImpact)
    .slice(0, MAX_POINTS);

  const unreadableAxes = SCORE_AXES.filter((axis) => (score.coverage?.[axis] ?? 1) < MIN_COVERAGE_FOR_BUY);

  return {
    bull,
    bear,
    watch,
    risks: detectRisks(score),
    unreadableAxes,
    inconclusive: bull.length < MIN_POINTS && bear.length < MIN_POINTS,
  };
}

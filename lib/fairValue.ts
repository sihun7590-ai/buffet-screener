// Several answers to "what is this worth", and what they add up to.
//
// One discounted-cash-flow number carries more authority on screen than it
// deserves: change the growth assumption by two points and it moves 30%. Four
// methods disagreeing is more honest than one method sounding certain, and the
// spread between them is itself the useful reading — estimates clustered inside
// a few percent mean something different from estimates 3x apart.
//
// IMPORTANT: nothing here feeds back into the Buffett Score. Every method reads
// numbers already sitting in a finished StockScore and derives a display value
// from them. That is why this does not bump SCORING_VERSION — the score is
// untouched, and data/scores.json does not need regenerating.
//
// Pure functions only, same rule as lib/scoring.ts and lib/peers.ts.
import type { StockScore } from "./types";

export const FAIR_VALUE_METHODS = ["dcf", "historicalPe", "sectorPe", "graham"] as const;
export type FairValueMethod = (typeof FAIR_VALUE_METHODS)[number];

// How much each method counts toward the blend. The discounted-cash-flow
// estimate leads because it's the only one that looks at cash the business
// actually produces rather than at a multiple someone else was willing to pay.
// The two multiple-based methods are anchors, not answers: a company's own
// history at least reflects how this business has been priced, while the sector
// average is the crudest of the four and weighted accordingly. Graham's number
// sits between — it uses reported earnings and book value, which is real, but
// its 22.5 constant is a rule of thumb from 1949.
//
// Weights are renormalised over whichever methods produced a number, so a
// company with no usable book value isn't penalised for it.
//
// Graham's weight is the one that was tuned rather than reasoned. Run over all
// 498 tickers at 20%, it dragged the blend down on nearly every asset-light
// business: the formula leans on book value per share, and for a company whose
// value is brands and software rather than plant, book value is close to
// nothing — it valued Apple at $38 against a $313 price. That isn't a finding,
// it's the formula being applied outside the 1949 balance sheets it was written
// for. At 10% it still moves the blend for the capital-heavy companies where it
// means something, without deciding the answer for the ones where it doesn't.
// For comparison, lib/scoring.ts gives it 15 of the valuation axis's 100
// points — under 4% of the overall score.
const METHOD_WEIGHTS: Record<FairValueMethod, number> = {
  dcf: 0.45,
  historicalPe: 0.3,
  sectorPe: 0.15,
  graham: 0.1,
};

// Above this high-to-low ratio the methods are not really estimating the same
// quantity any more and the blend should not be read as a target price. The
// median company sits at 2.7x, so this flags roughly the worst quarter rather
// than crying wolf on everything.
const WIDE_SPREAD_RATIO = 4;

export interface FairValueEstimate {
  method: FairValueMethod;
  /** Per share, USD. NaN when this method's inputs weren't in the filing. */
  value: number;
  /** Share of the blend this method actually got, after renormalisation. 0 when unavailable. */
  weight: number;
  /** (value - price) / value. NaN when value is not usable. */
  marginOfSafety: number;
  /** The numbers this estimate was built from, for the "show your work" line. */
  inputs: Record<string, number>;
}

export interface FairValueSummary {
  currentPrice: number;
  estimates: FairValueEstimate[];
  /** Weighted blend of the available estimates. NaN when none were available. */
  weightedFairValue: number;
  weightedMarginOfSafety: number;
  /** How many methods produced a number. */
  availableCount: number;
  /** Highest / lowest estimate — the disagreement between methods. */
  low: number;
  high: number;
  /** The methods disagree far enough that the blend shouldn't be read as a target price. */
  wideSpread: boolean;
  /**
   * Growth rate the current price implies, if you hold the discount and
   * terminal rates fixed and solve the DCF backwards. Not a valuation — a way
   * of asking "what would have to be true for today's price to be right?".
   * NaN when owner earnings are non-positive and the model doesn't apply.
   */
  impliedGrowthRate: number;
  /** Growth the forward DCF actually used, for comparison against the above. */
  assumedGrowthRate: number;
}

function criterionValue(s: StockScore, id: string, key: string): number {
  const c = s.criteria.find((x) => x.id === id);
  if (!c || c.available === false) return NaN;
  const v = c.values[key];
  return typeof v === "number" && Number.isFinite(v) ? v : NaN;
}

/**
 * The same five-year projection plus terminal value that lib/scoring.ts's
 * computeIntrinsicValue runs, expressed as a function of the growth rate so it
 * can be solved backwards. Kept deliberately identical: if these two ever
 * disagree, the implied growth rate would be answering a question about a model
 * we don't actually use.
 */
function dcfValue(ownerEarnings: number, growth: number, discount: number, terminal: number, years = 5): number {
  let pv = 0;
  let cash = ownerEarnings;
  for (let y = 1; y <= years; y++) {
    cash = cash * (1 + growth);
    pv += cash / (1 + discount) ** y;
  }
  const terminalValue = (cash * (1 + terminal)) / (discount - terminal);
  return pv + terminalValue / (1 + discount) ** years;
}

/**
 * The growth rate at which the DCF would output exactly today's price.
 *
 * Bisection rather than algebra: the terminal value makes this a fifth-order
 * polynomial in (1+g) with no clean closed form, and value is strictly
 * increasing in g for positive owner earnings, which is all bisection needs.
 * The search is capped at 60% a year — above that the answer is "the price
 * implies growth no large company sustains", and the exact figure stops
 * meaning anything.
 */
function impliedGrowth(price: number, ownerEarnings: number, discount: number, terminal: number): number {
  if (!(ownerEarnings > 0) || !(price > 0)) return NaN;

  let lo = -0.5;
  let hi = 0.6;
  if (dcfValue(ownerEarnings, lo, discount, terminal) > price) return NaN; // priced below even a shrinking business
  if (dcfValue(ownerEarnings, hi, discount, terminal) < price) return NaN; // priced above anything this model can reach

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (dcfValue(ownerEarnings, mid, discount, terminal) < price) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Every valuation this snapshot supports, plus their weighted blend.
 *
 * Two methods the brief asked for are absent, and it's worth saying why rather
 * than quietly dropping them: price/free-cash-flow and EV/EBITDA both need
 * figures no criterion stores, so they never reach data/scores.json. Adding
 * them means changing lib/scoring.ts and re-running the full refresh over 503
 * tickers. That's a deliberate deferral, not an oversight.
 */
export function computeFairValue(score: StockScore): FairValueSummary {
  const price = score.price;
  const iv = score.intrinsicValue;

  // The snapshot stores P/E rather than EPS, and P/E was computed against this
  // same stored price — so dividing gets the exact EPS back, not an estimate.
  const currentPe = criterionValue(score, "peRelative", "currentPe");
  const peOwnAvg = criterionValue(score, "peRelative", "peOwnAvg");
  const sectorPe = criterionValue(score, "peRelative", "sectorPe");
  const eps = currentPe > 0 && price > 0 ? price / currentPe : NaN;
  const grahamNumber = criterionValue(score, "grahamNumber", "grahamNumber");

  // A negative DCF is the model reporting that it doesn't apply here (capital
  // spending exceeds cash coming in), not a company worth less than nothing.
  const dcf = Number.isFinite(iv?.intrinsicValuePerShare) && iv.intrinsicValuePerShare > 0 ? iv.intrinsicValuePerShare : NaN;

  // Loss-making companies have no meaningful earnings multiple. Excluding them
  // here is the same call lib/scoring.ts makes: absent input, not bad result.
  const historicalPe = eps > 0 && peOwnAvg > 0 ? peOwnAvg * eps : NaN;
  const sectorPeValue = eps > 0 && sectorPe > 0 ? sectorPe * eps : NaN;

  const raw: Record<FairValueMethod, { value: number; inputs: Record<string, number> }> = {
    dcf: {
      value: dcf,
      inputs: {
        ownerEarningsPerShare: iv?.ownerEarningsPerShare ?? NaN,
        growthRateUsed: iv?.growthRateUsed ?? NaN,
        discountRate: iv?.discountRate ?? NaN,
        terminalGrowthRate: iv?.terminalGrowthRate ?? NaN,
      },
    },
    historicalPe: { value: historicalPe, inputs: { peOwnAvg, eps } },
    sectorPe: { value: sectorPeValue, inputs: { sectorPe, eps } },
    graham: { value: grahamNumber, inputs: { grahamNumber } },
  };

  const availableWeight = FAIR_VALUE_METHODS.reduce(
    (sum, m) => sum + (raw[m].value > 0 ? METHOD_WEIGHTS[m] : 0),
    0,
  );

  const estimates: FairValueEstimate[] = FAIR_VALUE_METHODS.map((method) => {
    const { value, inputs } = raw[method];
    const usable = value > 0;
    return {
      method,
      value: usable ? value : NaN,
      weight: usable && availableWeight > 0 ? METHOD_WEIGHTS[method] / availableWeight : 0,
      marginOfSafety: usable && price > 0 ? Math.max(-1, (value - price) / value) : NaN,
      inputs,
    };
  });

  const usable = estimates.filter((e) => Number.isFinite(e.value));
  const weightedFairValue = usable.length > 0 ? usable.reduce((sum, e) => sum + e.value * e.weight, 0) : NaN;
  const low = usable.length > 0 ? Math.min(...usable.map((e) => e.value)) : NaN;
  const high = usable.length > 0 ? Math.max(...usable.map((e) => e.value)) : NaN;

  return {
    currentPrice: price,
    estimates,
    weightedFairValue,
    weightedMarginOfSafety:
      weightedFairValue > 0 && price > 0 ? Math.max(-1, (weightedFairValue - price) / weightedFairValue) : NaN,
    availableCount: usable.length,
    low,
    high,
    wideSpread: low > 0 && high / low >= WIDE_SPREAD_RATIO,
    impliedGrowthRate: impliedGrowth(
      price,
      iv?.ownerEarningsPerShare ?? NaN,
      iv?.discountRate ?? 0.095,
      iv?.terminalGrowthRate ?? 0.025,
    ),
    assumedGrowthRate: iv?.growthRateUsed ?? NaN,
  };
}

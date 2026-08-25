// Lets a reader re-blend the five axes their own way — someone who cares more
// about a business surviving a downturn than about its growth rate can weight
// financial health higher and see the dashboard re-rank around that, without
// us guessing at a second "conservative" or "growth" preset on their behalf.
//
// Nothing here touches lib/scoring.ts's numbers. Each axis score, its
// coverage, and the margin of safety are already fixed measurements; this
// only changes how the five axis scores are blended into one, which is
// arithmetic a browser can do instantly on 499 rows with no server round
// trip. Recomputing which criteria are measurable, or the intrinsic value
// itself, is a different question this doesn't touch.
import { BUY_CANDIDATE_THRESHOLD, MIN_COVERAGE_FOR_BUY } from "./scoring";
import { AXIS_WEIGHTS, SCORE_AXES, type ScoreAxis, type StockScore } from "./types";

// Sliders hold relative importance, not a percentage that must sum to 100 —
// forcing a manual sum is its own small puzzle every time one slider moves.
// Any positive numbers work; normalizeWeights turns them into a blend that
// sums to 1 for computation, and back into whole-percent labels for display.
export type SliderWeights = Record<ScoreAxis, number>;

export const DEFAULT_SLIDER_WEIGHTS: SliderWeights = Object.fromEntries(
  SCORE_AXES.map((axis) => [axis, Math.round(AXIS_WEIGHTS[axis] * 100)]),
) as SliderWeights;

export function isDefaultWeights(sliders: SliderWeights): boolean {
  return SCORE_AXES.every((axis) => sliders[axis] === DEFAULT_SLIDER_WEIGHTS[axis]);
}

export function isValidSliderWeights(value: unknown): value is SliderWeights {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return SCORE_AXES.every((axis) => typeof v[axis] === "number" && Number.isFinite(v[axis]) && (v[axis] as number) >= 0);
}

/** Relative slider values -> a blend that sums to 1. All-zero falls back to the default blend rather than dividing by zero. */
export function normalizeWeights(sliders: SliderWeights): Record<ScoreAxis, number> {
  const sum = SCORE_AXES.reduce((s, axis) => s + Math.max(0, sliders[axis]), 0);
  if (sum <= 0) return AXIS_WEIGHTS;
  return Object.fromEntries(SCORE_AXES.map((axis) => [axis, Math.max(0, sliders[axis]) / sum])) as Record<ScoreAxis, number>;
}

export function customTotalScore(score: StockScore, weights: Record<ScoreAxis, number>): number {
  return Math.round(SCORE_AXES.reduce((sum, axis) => sum + score.scores[axis] * weights[axis], 0) * 10) / 10;
}

/**
 * Buy Candidate under a custom blend, by the same bar the default scoring
 * uses: the threshold, a genuine margin of safety, and enough coverage on
 * every axis to trust the number. Margin of safety and coverage don't depend
 * on the blend, so only the total needs recomputing here.
 */
export function customIsBuyCandidate(score: StockScore, customTotal: number): boolean {
  return (
    customTotal >= BUY_CANDIDATE_THRESHOLD &&
    score.intrinsicValue.marginOfSafety > 0 &&
    SCORE_AXES.every((axis) => (score.coverage?.[axis] ?? 1) >= MIN_COVERAGE_FOR_BUY)
  );
}

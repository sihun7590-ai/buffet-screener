// What a portfolio is actually worth, and what it's made of.
//
// The watchlist already answers "how has this moved since I noticed it".
// Holdings answer a different question — how much of your money is in it, and
// therefore which of these companies' problems are your problems. A 12% loss on
// a 2% position and the same loss on a 40% position are not the same event, and
// nothing on the site could tell them apart before this.
//
// Pure functions only. Prices and holdings come from the caller.
import { SCORE_AXES, type AxisScores, type ScoreAxis, type StockScore } from "./types";

export interface Holding {
  ticker: string;
  shares: number;
  averageCost: number;
  note: string | null;
}

export interface Position {
  ticker: string;
  companyName: string;
  sector: string;
  shares: number;
  averageCost: number;
  note: string | null;
  currentPrice: number;
  costBasis: number;
  marketValue: number;
  gain: number;
  /** Decimal. NaN when cost basis is zero (a gift, a spin-off recorded at nil). */
  gainPercent: number;
  /** Share of the whole portfolio's market value, 0-1. */
  weight: number;
  /** The company's Buffett score, or NaN when it isn't in the snapshot. */
  totalScore: number;
  marginOfSafety: number;
  isBuyCandidate: boolean;
}

export interface SectorExposure {
  sector: string;
  marketValue: number;
  weight: number;
  positions: number;
}

export interface PortfolioSummary {
  positions: Position[];
  costBasis: number;
  marketValue: number;
  gain: number;
  gainPercent: number;
  /**
   * The portfolio's own Buffett score: each company's score weighted by how
   * much of the portfolio it is. An unweighted average would let a $200
   * position drag down a portfolio that is 90% something else.
   */
  weightedScore: number;
  weightedAxes: AxisScores;
  /** Positions whose ticker isn't in the current snapshot — priced at cost, excluded from scoring. */
  unscored: string[];
  sectors: SectorExposure[];
  /** Largest single position's weight, 0-1. Concentration in one number. */
  topWeight: number;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * Combines holdings with the current snapshot and live prices.
 *
 * `priceOf` is separate from the snapshot because the snapshot's price is as of
 * the last batch run and a portfolio wants today's. Where the live quote failed,
 * returning NaN falls back to the snapshot price rather than showing a position
 * as worthless.
 */
export function summarizePortfolio(
  holdings: Holding[],
  scores: Map<string, StockScore>,
  priceOf: (ticker: string) => number,
): PortfolioSummary {
  const unscored: string[] = [];

  const partial = holdings.map((h) => {
    const score = scores.get(h.ticker);
    if (!score) unscored.push(h.ticker);

    const live = priceOf(h.ticker);
    const currentPrice = Number.isFinite(live) ? live : (score?.price ?? h.averageCost);

    const costBasis = h.shares * h.averageCost;
    const marketValue = h.shares * currentPrice;
    return {
      holding: h,
      score,
      currentPrice,
      costBasis,
      marketValue,
      gain: marketValue - costBasis,
      gainPercent: costBasis > 0 ? (marketValue - costBasis) / costBasis : NaN,
    };
  });

  const marketValue = sum(partial.map((p) => p.marketValue));
  const costBasis = sum(partial.map((p) => p.costBasis));

  const positions: Position[] = partial
    .map((p) => ({
      ticker: p.holding.ticker,
      companyName: p.score?.companyName ?? p.holding.ticker,
      sector: p.score?.sector ?? "",
      shares: p.holding.shares,
      averageCost: p.holding.averageCost,
      note: p.holding.note,
      currentPrice: p.currentPrice,
      costBasis: p.costBasis,
      marketValue: p.marketValue,
      gain: p.gain,
      gainPercent: p.gainPercent,
      weight: marketValue > 0 ? p.marketValue / marketValue : 0,
      totalScore: p.score?.totalScore ?? NaN,
      marginOfSafety: p.score?.intrinsicValue?.marginOfSafety ?? NaN,
      isBuyCandidate: p.score?.isBuyCandidate ?? false,
    }))
    // Largest position first: it's the one whose news matters most.
    .sort((a, b) => b.marketValue - a.marketValue);

  // Scored positions only, renormalised among themselves. Including an unscored
  // holding as a zero would report a portfolio of good companies as mediocre
  // because one ticker is missing from the snapshot.
  const scored = positions.filter((p) => Number.isFinite(p.totalScore));
  const scoredValue = sum(scored.map((p) => p.marketValue));
  const blend = (pick: (p: Position) => number) =>
    scoredValue > 0 ? sum(scored.map((p) => pick(p) * (p.marketValue / scoredValue))) : NaN;

  const weightedAxes = Object.fromEntries(
    SCORE_AXES.map((axis) => [
      axis,
      scoredValue > 0
        ? sum(
            scored.map((p) => {
              const s = scores.get(p.ticker)!.scores[axis];
              return (Number.isFinite(s) ? s : 0) * (p.marketValue / scoredValue);
            }),
          )
        : NaN,
    ]),
  ) as Record<ScoreAxis, number>;

  const bySector = new Map<string, { marketValue: number; positions: number }>();
  for (const p of positions) {
    const key = p.sector || "";
    const entry = bySector.get(key) ?? { marketValue: 0, positions: 0 };
    entry.marketValue += p.marketValue;
    entry.positions += 1;
    bySector.set(key, entry);
  }

  const sectors: SectorExposure[] = [...bySector.entries()]
    .map(([sector, v]) => ({
      sector,
      marketValue: v.marketValue,
      weight: marketValue > 0 ? v.marketValue / marketValue : 0,
      positions: v.positions,
    }))
    .sort((a, b) => b.marketValue - a.marketValue);

  return {
    positions,
    costBasis,
    marketValue,
    gain: marketValue - costBasis,
    gainPercent: costBasis > 0 ? (marketValue - costBasis) / costBasis : NaN,
    weightedScore: blend((p) => p.totalScore),
    weightedAxes,
    unscored,
    sectors,
    topWeight: positions.length > 0 ? positions[0].weight : 0,
  };
}

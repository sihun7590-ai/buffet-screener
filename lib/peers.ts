// Sector comparison. A score of 62 means little on its own — a bank and a
// software company are graded on the same five axes but sit in very different
// ranges — so the useful question is where a company falls among the ones it
// actually competes with.
//
// Everything here reads data/scores.json, which is already loaded to render
// the page. No fetching, no new source.
import { SCORE_AXES, type ScoreAxis, type StockScore } from "./types";

export type PeerMetric = ScoreAxis | "total";
export const PEER_METRICS: PeerMetric[] = [...SCORE_AXES, "total"];

const valueOf = (s: StockScore, metric: PeerMetric) => (metric === "total" ? s.totalScore : s.scores[metric]);

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface PeerRank {
  metric: PeerMetric;
  value: number;
  /** 1 = best in the sector. */
  rank: number;
  /** How many peers had a usable number for this metric. */
  ranked: number;
  sectorMedian: number;
  sectorBest: number;
}

// Every field here is read back out of `criteria` rather than recomputed, so a
// number in this table is the same number the criteria table shows on that
// company's own page. Nothing is derived a second way.
//
// Two metrics that would belong here are absent on purpose: price/free-cash-
// flow and EV/EBITDA. Neither survives into data/scores.json — no criterion
// needs them — and inventing them here would mean either a second, differently
// sourced calculation or a change to lib/scoring.ts and a full 30-minute
// refresh of all 503 tickers. Neither is worth it for two columns.
export interface PeerRow {
  ticker: string;
  companyName: string;
  marketCap: number;
  totalScore: number;
  isSelf: boolean;
  roe: number;
  roic: number;
  revenueCagr: number;
  epsCagr: number;
  fcfMargin: number;
  debtToEquity: number;
  currentPe: number;
  fairValue: number;
  marginOfSafety: number;
  periodEnd: string;
  /** Lowest axis coverage — a peer we could barely read is a weak comparison. */
  minCoverage: number;
}

export interface PeerComparison {
  sector: string;
  peerCount: number;
  ranks: PeerRank[];
  rows: PeerRow[];
}

// The criteria array is the only place raw ratios survive into the snapshot,
// and a criterion we couldn't measure carries a NaN rather than a wrong number.
function criterionValue(s: StockScore, id: string, key: string): number {
  const c = s.criteria.find((x) => x.id === id);
  if (!c || c.available === false) return NaN;
  const v = c.values[key];
  return typeof v === "number" ? v : NaN;
}

function toRow(s: StockScore, isSelf: boolean): PeerRow {
  return {
    ticker: s.ticker,
    companyName: s.companyName,
    marketCap: s.marketCap,
    totalScore: s.totalScore,
    isSelf,
    roe: criterionValue(s, "roe", "roeAvg"),
    roic: criterionValue(s, "roic", "roicAvg"),
    revenueCagr: criterionValue(s, "revenueCagr", "revenueCagr"),
    epsCagr: criterionValue(s, "epsCagr", "epsCagr"),
    fcfMargin: criterionValue(s, "fcfMargin", "fcfMargin"),
    debtToEquity: criterionValue(s, "debtToEquity", "debtEquity"),
    currentPe: criterionValue(s, "peRelative", "currentPe"),
    // Negative or zero intrinsic value means the model didn't apply (see the
    // owner-earnings note in lib/scoring.ts), not that the company is worth
    // nothing. Printing "-$63" in a comparison table would be worse than a dash.
    fairValue: (s.intrinsicValue?.intrinsicValuePerShare ?? NaN) > 0 ? s.intrinsicValue.intrinsicValuePerShare : NaN,
    marginOfSafety: s.intrinsicValue?.marginOfSafety ?? NaN,
    periodEnd: s.dataSource?.periodEnd ?? "",
    minCoverage: s.coverage ? Math.min(...SCORE_AXES.map((a) => s.coverage[a] ?? 1)) : 1,
  };
}

/**
 * Where `ticker` sits among its GICS sector, plus the handful of peers closest
 * to it in market capitalisation.
 *
 * Neighbours are chosen by size rather than by score: a $2T company and a $8B
 * one in the same sector are not really doing the same thing, and lining a
 * company up against the sector's highest scorers would answer a question
 * nobody asked. Sorting by size also puts the company in the middle of its own
 * table, which is where the eye looks for it.
 */
export function comparePeers(all: StockScore[], ticker: string, neighbours = 3): PeerComparison | null {
  const self = all.find((s) => s.ticker === ticker);
  if (!self) return null;

  const sector = all.filter((s) => s.sector === self.sector);
  // One company is not a comparison.
  if (sector.length < 2) return null;

  const ranks: PeerRank[] = PEER_METRICS.map((metric) => {
    const values = sector.map((s) => valueOf(s, metric)).filter(Number.isFinite);
    const value = valueOf(self, metric);
    return {
      metric,
      value,
      rank: Number.isFinite(value) ? values.filter((v) => v > value).length + 1 : NaN,
      ranked: values.length,
      sectorMedian: median(values),
      sectorBest: values.length ? Math.max(...values) : NaN,
    };
  });

  const bySize = [...sector]
    .filter((s) => Number.isFinite(s.marketCap))
    .sort((a, b) => b.marketCap - a.marketCap);
  const selfIndex = bySize.findIndex((s) => s.ticker === ticker);

  const window = neighbours * 2 + 1;
  const rows =
    // Visa and Berkshire tag no usable share count, so they have no market cap
    // to place them in the ordering. Dropping to a one-row table would be a
    // comparison against nobody; they go at the head of the sector's largest
    // instead, and the ranking bars above never needed market cap anyway.
    selfIndex === -1
      ? [toRow(self, true), ...bySize.slice(0, window - 1).map((s) => toRow(s, false))]
      : // A company at either end of its sector by size still gets a full
        // window, taken entirely from the side that exists.
        bySize
          .slice(
            Math.max(0, Math.min(selfIndex - neighbours, bySize.length - window)),
            Math.max(selfIndex + neighbours + 1, window),
          )
          .map((s) => toRow(s, s.ticker === ticker));

  return { sector: self.sector, peerCount: sector.length, ranks, rows };
}

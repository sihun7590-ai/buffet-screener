// What changed about a company you were watching.
//
// There is no email or push here, and won't be without a budget. What this
// does instead is compare a watched company against its own past — which the
// score history already holds — and surface the changes worth a second look
// when you next open the page. The useful ones are not price moves, which
// every broker already shows, but the ones that quietly undo the reason you
// were interested: the balance sheet deteriorating, the margin of safety
// closing, a company dropping out of Buy Candidate.
import type { ScoreHistoryPoint } from "@/components/ScoreHistoryChart";
import { SCORE_AXES, type ScoreAxis, type StockScore } from "./types";

export type AlertKind =
  | "totalDrop"
  | "totalRise"
  | "axisDrop"
  | "axisRise"
  | "buyExited"
  | "buyEntered"
  | "marginClosed"
  | "marginOpened"
  | "priceDrop";

// "warn" is not "bad news" — it's "this could undo your reason for holding".
// A score rising sharply is worth a look too, but it doesn't call into
// question a decision already made.
export type AlertSeverity = "info" | "warn";

export interface StockAlert {
  ticker: string;
  kind: AlertKind;
  severity: AlertSeverity;
  axis?: ScoreAxis;
  from: number;
  to: number;
  delta: number;
  /** as_of of the point compared against; empty for price alerts. */
  since: string;
  /** True when the comparison point was reconstructed rather than published. */
  sinceBackfilled: boolean;
}

// Kinds whose `from`/`to`/`delta` are ratios rather than points out of 100.
// The display formats them as percentages, and any comparison of magnitudes
// has to scale them first — otherwise a 68% price fall (0.68) ranks below a
// six-point score move.
export const RATIO_KINDS: ReadonlySet<AlertKind> = new Set<AlertKind>(["marginClosed", "marginOpened", "priceDrop"]);

const magnitude = (a: StockAlert) => (RATIO_KINDS.has(a.kind) ? Math.abs(a.delta) * 100 : Math.abs(a.delta));

const DAY = 86_400_000;

// Compare against the newest point at least this old. A month is roughly the
// gap between quarterly filings landing, which is what actually moves these
// scores; anything tighter would mostly report the share price nudging the
// valuation axis around.
const MIN_LOOKBACK_DAYS = 30;

// Below these, the change is noise — prices move every axis a little through
// the valuation criteria, and flagging every wobble trains people to ignore
// the panel entirely.
const TOTAL_THRESHOLD = 5;
const AXIS_THRESHOLD = 12;
const PRICE_DROP_THRESHOLD = 0.25;

export interface AlertInput {
  score: StockScore;
  history: ScoreHistoryPoint[]; // oldest first
  priceAtFavorite?: number;
  currentPrice?: number;
  now?: Date;
}

/**
 * The newest history point at least `days` old, or null if the series doesn't
 * reach back that far. Returns the *newest* qualifying point rather than the
 * closest to the target date, so a sparse series still yields the tightest
 * comparison it can support.
 */
function pointBefore(history: ScoreHistoryPoint[], days: number, now: Date): ScoreHistoryPoint | null {
  const cutoff = now.getTime() - days * DAY;
  let best: ScoreHistoryPoint | null = null;
  for (const p of history) {
    const t = new Date(`${p.asOf}T00:00:00Z`).getTime();
    if (t > cutoff) continue;
    if (!best || p.asOf > best.asOf) best = p;
  }
  return best;
}

export function detectAlerts({ score, history, priceAtFavorite, currentPrice, now = new Date() }: AlertInput): StockAlert[] {
  const alerts: StockAlert[] = [];
  const base = (kind: AlertKind, severity: AlertSeverity, from: number, to: number, since: ScoreHistoryPoint) => ({
    ticker: score.ticker,
    kind,
    severity,
    from,
    to,
    delta: to - from,
    since: since.asOf,
    sinceBackfilled: since.isBackfilled,
  });

  const reference = pointBefore(history, MIN_LOOKBACK_DAYS, now);

  if (reference) {
    // A score computed under a different formula version differs partly
    // because of us, not the company. Reporting that as news about the
    // business would be the same lie the version field exists to prevent.
    const comparable =
      reference.scoringVersion === undefined || reference.scoringVersion === score.scoringVersion;

    if (comparable) {
      // Crossings, not magnitudes: dropping out of Buy Candidate or watching
      // the margin of safety close are step changes, and both are exactly the
      // reason someone put the company on the list.
      if (reference.isBuyCandidate === true && !score.isBuyCandidate) {
        alerts.push(base("buyExited", "warn", 1, 0, reference));
      } else if (reference.isBuyCandidate === false && score.isBuyCandidate) {
        alerts.push(base("buyEntered", "info", 0, 1, reference));
      }

      const mosBefore = reference.marginOfSafety;
      const mosAfter = score.intrinsicValue.marginOfSafety;
      if (typeof mosBefore === "number" && Number.isFinite(mosBefore) && Number.isFinite(mosAfter)) {
        if (mosBefore > 0 && mosAfter <= 0) alerts.push(base("marginClosed", "warn", mosBefore, mosAfter, reference));
        else if (mosBefore <= 0 && mosAfter > 0) alerts.push(base("marginOpened", "info", mosBefore, mosAfter, reference));
      }

      const totalDelta = score.totalScore - reference.total;
      if (Math.abs(totalDelta) >= TOTAL_THRESHOLD) {
        alerts.push(
          base(totalDelta < 0 ? "totalDrop" : "totalRise", totalDelta < 0 ? "warn" : "info", reference.total, score.totalScore, reference),
        );
      }

      for (const axis of SCORE_AXES) {
        const before = reference[axis];
        const after = score.scores[axis];
        if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
        const delta = after - before;
        if (Math.abs(delta) < AXIS_THRESHOLD) continue;
        alerts.push({ ...base(delta < 0 ? "axisDrop" : "axisRise", delta < 0 ? "warn" : "info", before, after, reference), axis });
      }
    }
  }

  // Falls only, and a steep one. The watchlist table already carries change
  // since you added it as its own column, so repeating every move here would
  // just be that column again with fewer rows. What earns a place is the move
  // that prompts re-reading the thesis — and a rally doesn't: its effect on
  // value is already reported by the margin-of-safety and valuation alerts
  // above, from the other direction.
  if (
    priceAtFavorite !== undefined &&
    Number.isFinite(priceAtFavorite) &&
    priceAtFavorite > 0 &&
    Number.isFinite(currentPrice ?? NaN)
  ) {
    const change = (currentPrice! - priceAtFavorite) / priceAtFavorite;
    if (change <= -PRICE_DROP_THRESHOLD) {
      alerts.push({
        ticker: score.ticker,
        kind: "priceDrop",
        severity: "warn",
        from: priceAtFavorite,
        to: currentPrice!,
        delta: change,
        since: "",
        sinceBackfilled: false,
      });
    }
  }

  // Warnings first, then the largest moves — the panel is scanned top-down and
  // the thing that undoes a thesis should not sit below a rally.
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "warn" ? -1 : 1;
    return magnitude(b) - magnitude(a);
  });
}

/**
 * Orders a whole watchlist's alerts: companies that need attention first, and
 * each company's changes kept together.
 *
 * Sorting the flat list by severity alone splits a company in two — its
 * warning at the top, its other change several rows below, with unrelated
 * companies in between. Two facts about the same business read as one thought
 * only when they're adjacent.
 */
export function groupAlertsByTicker(alerts: StockAlert[]): StockAlert[] {
  const groups = new Map<string, StockAlert[]>();
  for (const a of alerts) {
    const list = groups.get(a.ticker) ?? [];
    list.push(a);
    groups.set(a.ticker, list);
  }

  return [...groups.values()]
    .sort((a, b) => {
      const warned = (g: StockAlert[]) => (g.some((x) => x.severity === "warn") ? 0 : 1);
      if (warned(a) !== warned(b)) return warned(a) - warned(b);
      // Between two equally urgent companies, the one that moved most.
      return Math.max(...b.map(magnitude)) - Math.max(...a.map(magnitude));
    })
    .flat();
}


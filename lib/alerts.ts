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

// The comparison point is the newest one at least `lookbackDays` old. A month
// is roughly the gap between quarterly filings landing, which is what actually
// moves these scores; anything tighter would mostly report the share price
// nudging the valuation axis around. Below the thresholds, a change is noise —
// prices move every axis a little through the valuation criteria, and flagging
// every wobble trains people to ignore the panel entirely.
//
// These are defaults now rather than constants: what counts as noise depends on
// how closely someone is watching, and a person holding six companies wants a
// finer setting than one scanning sixty. A signed-in user's saved values come
// from public.alert_settings (migration 004); everyone else, and every caller
// that doesn't care, gets exactly the numbers this shipped with.
export interface AlertSettings {
  /** Points of total-score movement worth reporting. */
  totalThreshold: number;
  /** Points of single-axis movement worth reporting. */
  axisThreshold: number;
  /** Decimal — 0.25 is a 25% fall from the entry price. */
  priceDropThreshold: number;
  /** How far back to compare against, in days. */
  lookbackDays: number;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  totalThreshold: 5,
  axisThreshold: 12,
  priceDropThreshold: 0.25,
  lookbackDays: 30,
};

// Guard rails for values arriving from the database. A zero or negative
// threshold would fire on every company on every load, which is indistinguishable
// from the feature being broken.
export function normalizeAlertSettings(partial: Partial<AlertSettings> | null | undefined): AlertSettings {
  const d = DEFAULT_ALERT_SETTINGS;
  const positive = (v: unknown, fallback: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 && v <= max ? v : fallback;
  return {
    totalThreshold: positive(partial?.totalThreshold, d.totalThreshold, 100),
    axisThreshold: positive(partial?.axisThreshold, d.axisThreshold, 100),
    // Strictly under 1: a 100% fall is a delisting, not an alert threshold.
    priceDropThreshold:
      typeof partial?.priceDropThreshold === "number" &&
      Number.isFinite(partial.priceDropThreshold) &&
      partial.priceDropThreshold > 0 &&
      partial.priceDropThreshold < 1
        ? partial.priceDropThreshold
        : d.priceDropThreshold,
    lookbackDays: positive(partial?.lookbackDays, d.lookbackDays, 3650),
  };
}

export interface AlertInput {
  score: StockScore;
  history: ScoreHistoryPoint[]; // oldest first
  priceAtFavorite?: number;
  currentPrice?: number;
  now?: Date;
  settings?: AlertSettings;
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

export function detectAlerts({
  score,
  history,
  priceAtFavorite,
  currentPrice,
  now = new Date(),
  settings = DEFAULT_ALERT_SETTINGS,
}: AlertInput): StockAlert[] {
  const { totalThreshold, axisThreshold, priceDropThreshold, lookbackDays } = settings;
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

  const reference = pointBefore(history, lookbackDays, now);

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
      if (Math.abs(totalDelta) >= totalThreshold) {
        alerts.push(
          base(totalDelta < 0 ? "totalDrop" : "totalRise", totalDelta < 0 ? "warn" : "info", reference.total, score.totalScore, reference),
        );
      }

      for (const axis of SCORE_AXES) {
        const before = reference[axis];
        const after = score.scores[axis];
        if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
        const delta = after - before;
        if (Math.abs(delta) < axisThreshold) continue;
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
    if (change <= -priceDropThreshold) {
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


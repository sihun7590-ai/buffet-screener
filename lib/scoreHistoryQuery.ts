import { createClient } from "./supabase/server";
import type { ScoreHistoryPoint } from "@/components/ScoreHistoryChart";

// Reads score history for the detail page's chart and the watchlist's change
// detection. Uses the ordinary (anon) client on purpose — score_history has a
// public select policy and no write policy, so this needs no privileged access.
const COLUMNS =
  "ticker, as_of, total, quality, growth, health, consistency, valuation, price, is_backfilled, margin_of_safety, is_buy_candidate, scoring_version";

type Row = Record<string, unknown>;

const toPoint = (r: Row): ScoreHistoryPoint => ({
  asOf: r.as_of as string,
  total: r.total as number,
  quality: r.quality as number,
  growth: r.growth as number,
  health: r.health as number,
  consistency: r.consistency as number,
  valuation: r.valuation as number,
  price: (r.price as number | null) ?? null,
  isBackfilled: Boolean(r.is_backfilled),
  marginOfSafety: (r.margin_of_safety as number | null) ?? null,
  isBuyCandidate: Boolean(r.is_buy_candidate),
  scoringVersion: r.scoring_version as number,
});

export async function fetchScoreHistory(ticker: string, limit = 24): Promise<ScoreHistoryPoint[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("score_history")
      .select(COLUMNS)
      .eq("ticker", ticker.toUpperCase())
      .order("as_of", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map(toPoint).reverse(); // oldest first, for plotting left to right
  } catch {
    // The chart is one panel among many — a history outage shouldn't take the
    // stock page down with it.
    return [];
  }
}

/**
 * History for a whole watchlist in one round trip, keyed by ticker.
 *
 * A query per favourite would be dozens of sequential round trips on a page
 * that already waits on a live quote for each one. `perTicker` bounds it: the
 * comparison reaches back a quarter at most, so a handful of recent points per
 * company is all it can use.
 */
export async function fetchScoreHistoryForTickers(
  tickers: string[],
  perTicker = 8,
): Promise<Map<string, ScoreHistoryPoint[]>> {
  const grouped = new Map<string, ScoreHistoryPoint[]>();
  if (tickers.length === 0) return grouped;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("score_history")
      .select(COLUMNS)
      .in(
        "ticker",
        tickers.map((t) => t.toUpperCase()),
      )
      .order("as_of", { ascending: false })
      .limit(tickers.length * perTicker);

    if (error || !data) return grouped;

    // Newest first from the query, so the per-ticker cap keeps the most recent
    // points — which are the ones the comparison windows can reach.
    for (const row of data) {
      const ticker = row.ticker as string;
      const list = grouped.get(ticker) ?? [];
      if (list.length >= perTicker) continue;
      list.push(toPoint(row));
      grouped.set(ticker, list);
    }
    for (const [ticker, list] of grouped) grouped.set(ticker, list.reverse());
    return grouped;
  } catch {
    // No history means no change detection — the watchlist itself still works.
    return grouped;
  }
}

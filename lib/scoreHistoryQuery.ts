import { createClient } from "./supabase/server";
import type { ScoreHistoryPoint } from "@/components/ScoreHistoryChart";

// Reads one ticker's score history for the detail page's chart. Uses the
// ordinary (anon) client on purpose — score_history has a public select policy
// and no write policy, so this needs no privileged access.
export async function fetchScoreHistory(ticker: string, limit = 24): Promise<ScoreHistoryPoint[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("score_history")
      .select("as_of, total, quality, growth, health, consistency, valuation, price, is_backfilled")
      .eq("ticker", ticker.toUpperCase())
      .order("as_of", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data
      .map((r) => ({
        asOf: r.as_of as string,
        total: r.total as number,
        quality: r.quality as number,
        growth: r.growth as number,
        health: r.health as number,
        consistency: r.consistency as number,
        valuation: r.valuation as number,
        price: (r.price as number | null) ?? null,
        isBackfilled: Boolean(r.is_backfilled),
      }))
      .reverse(); // oldest first, for plotting left to right
  } catch {
    // The chart is one panel among many — a history outage shouldn't take the
    // stock page down with it.
    return [];
  }
}

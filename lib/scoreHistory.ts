import { createAdminClient } from "./supabase/admin";
import type { StockScore } from "./types";

// Supabase rejects an oversized payload, and 500 slim rows per request keeps
// the whole S&P 500 to a couple of round trips.
const CHUNK_SIZE = 500;

// NaN and Infinity aren't representable in JSON, so anything non-finite has to
// go across as an explicit null rather than silently failing the insert.
const orNull = (v: number) => (Number.isFinite(v) ? v : null);

export interface ScoreHistoryResult {
  day: string;
  written: number;
  skippedTickers: string[];
  /** Why nothing was written, when that's the case — otherwise null. */
  disabledReason: string | null;
}

// Appends today's scores to the history table. The screener itself never reads
// this — it exists so the past survives data/scores.json being overwritten on
// the next refresh.
export async function saveScoreHistory(scores: StockScore[], asOf = new Date()): Promise<ScoreHistoryResult> {
  const day = asOf.toISOString().slice(0, 10);
  const supabase = createAdminClient();

  if (!supabase) {
    return {
      day,
      written: 0,
      skippedTickers: [],
      disabledReason:
        "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local에 없습니다 — 점수 히스토리 적재를 건너뜁니다.",
    };
  }

  // A score whose axes didn't come out as numbers has nothing to record, and
  // the table's NOT NULL columns would reject it anyway.
  const skippedTickers: string[] = [];
  const rows = scores
    .filter((s) => {
      const usable =
        Number.isFinite(s.totalScore) && Object.values(s.scores).every((v) => Number.isFinite(v));
      if (!usable) skippedTickers.push(s.ticker);
      return usable;
    })
    .map((s) => ({
      ticker: s.ticker,
      as_of: day,
      total: s.totalScore,
      quality: s.scores.quality,
      growth: s.scores.growth,
      health: s.scores.health,
      consistency: s.scores.consistency,
      valuation: s.scores.valuation,
      price: orNull(s.price),
      margin_of_safety: orNull(s.intrinsicValue.marginOfSafety),
      is_buy_candidate: s.isBuyCandidate,
      scoring_version: s.scoringVersion,
    }));

  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    // Re-running the batch on the same day replaces that day's rows rather
    // than failing on the (ticker, as_of) primary key.
    const { error } = await supabase.from("score_history").upsert(chunk, { onConflict: "ticker,as_of" });
    if (error) {
      throw new Error(`score_history 저장 실패 (${i + 1}~${i + chunk.length}번째): ${error.message}`);
    }
    written += chunk.length;
  }

  return { day, written, skippedTickers, disabledReason: null };
}

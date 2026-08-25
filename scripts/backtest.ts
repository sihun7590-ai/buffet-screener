// Builds data/backtest.json from the quarterly backfilled rows already
// sitting in score_history, plus SPY's own price history as a real-market
// benchmark.
//
//   npm run backtest
//
// This is read-only against Supabase (the anon key is enough — score_history
// has a public select policy and no write policy) and writes nothing back to
// the database. It reuses fetchPriceHistory/closeNear from lib/price.ts, the
// same Yahoo Finance endpoint every stock's price already comes from, so SPY
// costs exactly one extra request.
//
// Every row in score_history is scoring_version 4 today, but the filter below
// is explicit anyway: a future v5 backfill will add new rows to the same
// table, and mixing formula versions into one "quarter" would silently
// compare a v4 selection against a v5 one.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../lib/supabase/env";
import { fetchPriceHistory, closeNear } from "../lib/price";
import { runBacktest, quarterDatesFromRows, type QuarterlyScoreRow } from "../lib/backtest";
import { writeBacktest } from "../lib/backtestStore";

async function run() {
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Supabase caps a single select at 1000 rows by default; ~6,900 backfilled
  // rows need paging or everything past the first two quarters silently goes
  // missing.
  const PAGE_SIZE = 1000;
  const data: Record<string, unknown>[] = [];
  for (let page = 0; ; page++) {
    const { data: chunk, error } = await db
      .from("score_history")
      .select("ticker, as_of, total, is_buy_candidate, price")
      .eq("is_backfilled", true)
      .eq("scoring_version", 4)
      .order("as_of", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) {
      console.error("score_history 조회 실패:", error.message);
      process.exit(1);
    }
    if (!chunk || chunk.length === 0) break;
    data.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  if (data.length === 0) {
    console.error("백필된 점수 히스토리가 없습니다. 먼저 `npm run backfill`을 실행하세요.");
    process.exit(1);
  }

  const rows: QuarterlyScoreRow[] = data.map((r) => ({
    ticker: r.ticker as string,
    asOf: r.as_of as string,
    total: r.total as number,
    isBuyCandidate: Boolean(r.is_buy_candidate),
    price: (r.price as number | null) ?? null,
  }));

  const dates = quarterDatesFromRows(rows);
  console.log(`백테스트 대상: ${rows.length}개 행, ${dates.length}개 분기말 (${dates[0]} ~ ${dates.at(-1)})`);

  console.log("SPY 가격 히스토리 조회 중...");
  const spyHistory = await fetchPriceHistory("SPY");
  const spyQuotes = dates.map((asOf) => ({ asOf, price: closeNear(spyHistory, asOf) }));

  const missingSpy = spyQuotes.filter((q) => !Number.isFinite(q.price));
  if (missingSpy.length > 0) {
    console.warn(
      `SPY 가격을 찾지 못한 시점: ${missingSpy.map((q) => q.asOf).join(", ")} (해당 분기는 SPY 수익률 0으로 처리됩니다)`,
    );
  }

  const result = runBacktest(rows, spyQuotes);
  writeBacktest(result);

  console.log("\n전략별 요약:");
  for (const s of result.strategies) {
    const holdingsNote =
      s.minHoldings != null ? ` · 보유 종목 ${s.minHoldings}~${s.maxHoldings}개` : "";
    console.log(
      `  ${s.id.padEnd(12)} 누적 ${(s.totalReturn * 100).toFixed(1)}%  CAGR ${(s.cagr * 100).toFixed(1)}%  ` +
        `MDD ${(s.maxDrawdown * 100).toFixed(1)}%  (+${s.positiveQuarters}/-${s.negativeQuarters}분기)${holdingsNote}`,
    );
  }
  console.log(`\ndata/backtest.json 작성 완료.`);
}

run().catch((err) => {
  console.error("백테스트 실패:", (err as Error).message);
  process.exit(1);
});

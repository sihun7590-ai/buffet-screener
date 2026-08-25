// Reconstructs past scores and writes them to score_history.
//
//   npm run backfill                        -- last 3 years, quarterly
//   npm run backfill -- --years 5
//   npm run backfill -- --ticker LULU
//   npm run backfill -- --ticker LULU --dry-run   -- print, don't write
//
// For each quarter-end date it rebuilds the company's financials from only the
// filings that were public on that date and prices it at that date's close, so
// the result is what today's formula would have said with the information then
// available. That last part matters: using figures published later would make
// every past score look prescient, the classic look-ahead bias.
//
// Each company is downloaded once and replayed across every date, so the cost
// is one pass over the universe regardless of how many years are requested.
import universe from "../data/universe.json";
import { buildTickerFinancials, fetchTickerRawData } from "../lib/sec";
import { scoreTicker } from "../lib/scoring";
import { saveScoreHistory } from "../lib/scoreHistory";
import type { StockScore } from "../lib/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Calendar quarter-ends, newest first, skipping any still in the future.
function quarterEnds(years: number): string[] {
  const out: string[] = [];
  const today = new Date();
  const startYear = today.getUTCFullYear() - years;

  for (let y = today.getUTCFullYear(); y >= startYear; y--) {
    for (const [month, day] of [
      [12, 31],
      [9, 30],
      [6, 30],
      [3, 31],
    ] as const) {
      const date = new Date(Date.UTC(y, month - 1, day));
      if (date <= today) out.push(date.toISOString().slice(0, 10));
    }
  }
  return out;
}

async function run() {
  const years = Number(arg("years") ?? 3);
  const onlyTicker = arg("ticker")?.toUpperCase();
  const dates = quarterEnds(years);

  const tickers = (universe as { ticker: string }[])
    .map((u) => u.ticker)
    .filter((t) => !onlyTicker || t === onlyTicker);

  if (tickers.length === 0) {
    console.error(`${onlyTicker}: data/universe.json에 없는 티커입니다.`);
    process.exit(1);
  }

  console.log(`백필 대상: ${tickers.length}개 종목 × ${dates.length}개 시점 (${dates.at(-1)} ~ ${dates[0]})`);

  // Collected per date so each write is one bulk upsert per quarter rather
  // than a request per company.
  const byDate = new Map<string, StockScore[]>(dates.map((d) => [d, []]));
  const failures: string[] = [];

  for (const [i, ticker] of tickers.entries()) {
    process.stdout.write(`[${i + 1}/${tickers.length}] ${ticker} ... `);
    try {
      const raw = await fetchTickerRawData(ticker);
      let built = 0;
      for (const date of dates) {
        try {
          const financials = buildTickerFinancials(ticker, raw, date);
          // A date before the company's first filing, or before it listed,
          // simply has no score — skip rather than invent one.
          if (!Number.isFinite(financials.quote.price)) continue;
          byDate.get(date)!.push(scoreTicker(financials, `${date}T00:00:00.000Z`));
          built++;
        } catch {
          // Nothing filed yet as of this date.
        }
      }
      console.log(`${built}개 시점`);
    } catch (err) {
      failures.push(ticker);
      console.log(`실패 (${(err as Error).message})`);
    }
  }

  if (process.argv.includes("--dry-run")) {
    console.log("\n--dry-run: 적재하지 않고 계산 결과만 출력합니다.\n");
    console.log("날짜         종합   사업의질  성장성  안정성  일관성  저평가   주가");
    for (const date of dates) {
      for (const s of byDate.get(date)!) {
        const c = s.scores;
        console.log(
          `${date}  ${s.totalScore.toFixed(1).padStart(5)}  ${c.quality.toFixed(0).padStart(7)}` +
            `${c.growth.toFixed(0).padStart(8)}${c.health.toFixed(0).padStart(8)}` +
            `${c.consistency.toFixed(0).padStart(8)}${c.valuation.toFixed(0).padStart(8)}` +
            `   $${s.price.toFixed(2)}`,
        );
      }
    }
    return;
  }

  console.log("\n적재 중...");
  let total = 0;
  for (const date of dates) {
    const scores = byDate.get(date)!;
    if (scores.length === 0) continue;
    const result = await saveScoreHistory(scores, {
      asOf: new Date(`${date}T00:00:00.000Z`),
      backfilled: true,
      includeCriteria: true,
    });
    if (result.disabledReason) {
      console.error(result.disabledReason);
      process.exit(1);
    }
    total += result.written;
    console.log(`  ${date}: ${result.written}건`);
  }

  console.log(`\n완료: ${total}건 적재, ${failures.length}개 종목 실패`);
  if (failures.length > 0) console.log("실패:", failures.join(", "));
}

run().catch((err) => {
  console.error("백필 실패:", (err as Error).message);
  process.exit(1);
});

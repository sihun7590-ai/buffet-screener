// Batch job: walk the ticker universe, pull fundamentals from SEC EDGAR +
// Yahoo Finance (or fall back to bundled fixtures), score each one against
// the Buffett/Graham criteria, and cache the results to data/scores.json.
//
// Both data sources are free and keyless, so this needs no setup — just run:
//   npm run refresh
//   npm run refresh -- --fixture   (force fixture/sample data instead)
import universe from "../data/universe.json";
import { FIXTURE_FINANCIALS } from "../data/fixtures";
import { fetchTickerFinancials } from "../lib/sec";
import { scoreTicker } from "../lib/scoring";
import { writeScores } from "../lib/store";
import type { StockScore, TickerFinancials } from "../lib/types";

const useFixture = process.argv.includes("--fixture");

async function run() {
  if (useFixture) {
    console.log("--fixture 플래그 감지: 샘플 데이터로 스코어를 생성합니다.");
    const scores = FIXTURE_FINANCIALS.map((f) => scoreTicker(f));
    writeScores(scores, "fixture");
    console.log(`완료: ${scores.length}개 종목 (샘플 데이터) → data/scores.json`);
    return;
  }

  const tickers = (universe as { ticker: string }[]).map((u) => u.ticker);
  const scores: StockScore[] = [];
  const failures: string[] = [];

  for (const [i, ticker] of tickers.entries()) {
    process.stdout.write(`[${i + 1}/${tickers.length}] ${ticker} ... `);
    try {
      const financials: TickerFinancials = await fetchTickerFinancials(ticker);
      scores.push(scoreTicker(financials));
      console.log("ok");
    } catch (err) {
      failures.push(ticker);
      console.log(`실패 (${(err as Error).message})`);
    }
  }

  writeScores(scores, "live");
  console.log(`완료: ${scores.length}개 종목 성공, ${failures.length}개 실패 → data/scores.json`);
  if (failures.length > 0) {
    console.log("실패한 종목:", failures.join(", "));
  }
}

run().catch((err) => {
  console.error("배치 작업 실패:", err);
  process.exit(1);
});

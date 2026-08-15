// Batch job: walk the ticker universe, pull fundamentals from FMP (or fall
// back to bundled fixtures when no API key is set), score each one against
// the Buffett/Graham criteria, and cache the results to data/scores.json.
//
// Usage:
//   npm run refresh            (uses FMP_API_KEY from .env.local if present,
//                                otherwise automatically uses fixture data)
//   npm run refresh -- --fixture   (force fixture data even if a key is set)
import "dotenv/config";
import universe from "../data/universe.json";
import { FIXTURE_FINANCIALS } from "../data/fixtures";
import { fetchTickerFinancials } from "../lib/fmp";
import { scoreTicker } from "../lib/scoring";
import { writeScores } from "../lib/store";
import type { StockScore, TickerFinancials } from "../lib/types";

const forceFixture = process.argv.includes("--fixture");
const useFixture = forceFixture || !process.env.FMP_API_KEY;

async function run() {
  if (useFixture) {
    console.log(
      forceFixture
        ? "--fixture 플래그 감지: 샘플 데이터로 스코어를 생성합니다."
        : "FMP_API_KEY가 설정되지 않음: 샘플 데이터로 스코어를 생성합니다. (.env.local 참고)"
    );
    const scores = FIXTURE_FINANCIALS.map((f) => scoreTicker(f));
    writeScores(scores, "fixture");
    console.log(`완료: ${scores.length}개 종목 (샘플 데이터) → data/scores.json`);
    return;
  }

  const tickers = universe as string[];
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

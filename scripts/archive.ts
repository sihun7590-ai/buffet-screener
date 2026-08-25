// Pushes the scores already sitting in data/scores.json into Supabase's
// score_history table, without re-fetching anything from SEC or Yahoo.
//
//   npm run archive
//
// `npm run refresh` already does this at the end of a run. This exists to run
// just the archive step on its own — after a write failed, or to seed history
// from a snapshot without spending half an hour re-downloading filings.
import { readScores } from "../lib/store";
import { saveScoreHistory } from "../lib/scoreHistory";

async function run() {
  const { scores, source, generatedAt } = readScores();

  if (scores.length === 0) {
    console.error("data/scores.json 이 비어 있습니다. 먼저 `npm run refresh` 를 실행하세요.");
    process.exit(1);
  }

  if (source === "fixture") {
    console.error("샘플(fixture) 데이터는 히스토리에 넣지 않습니다 — 실제 점수 추이가 오염됩니다.");
    process.exit(1);
  }

  // Dated by when the snapshot was computed, not by when this script happens
  // to run, so re-archiving an older file doesn't misfile it as today.
  const result = await saveScoreHistory(scores, new Date(generatedAt));

  if (result.disabledReason) {
    console.error(result.disabledReason);
    process.exit(1);
  }

  console.log(`점수 히스토리: ${result.day}자 ${result.written}건 저장 완료.`);
  if (result.skippedTickers.length > 0) {
    console.log(`  점수를 계산하지 못해 제외: ${result.skippedTickers.join(", ")}`);
  }
}

run().catch((err) => {
  console.error("점수 히스토리 저장 실패:", (err as Error).message);
  process.exit(1);
});

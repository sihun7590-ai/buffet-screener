import Dashboard from "@/components/Dashboard";
import { readScores } from "@/lib/store";

// scores.json changes whenever `npm run refresh` runs; read it fresh on
// every request instead of baking it into the build.
export const dynamic = "force-dynamic";

export default function Home() {
  const { scores, generatedAt, source } = readScores();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">버핏 저평가 우량주 스크리너</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            워렌 버핏·벤저민 그레이엄의 정량 기준(ROE, ROIC, 부채비율, 이익 일관성, 안전마진 등)으로 미국 대형주를 스코어링합니다.
            {generatedAt && ` 기준일: ${new Date(generatedAt).toLocaleString("ko-KR")}`}
          </p>
        </header>

        {source === "fixture" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            ⚠️ 지금 보고 있는 데이터는 <strong>샘플(가상) 데이터</strong>입니다. 실제 데이터로 전환하려면{" "}
            <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">npm run refresh</code>를 실행하세요. (별도 키 설정 없이 바로 됩니다 — 자세한 방법은 README 참고)
          </div>
        )}

        {scores.length === 0 ? (
          <div className="rounded-xl border border-black/10 bg-white p-10 text-center text-zinc-500 dark:border-white/10 dark:bg-zinc-900">
            아직 스코어 데이터가 없습니다. <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">npm run refresh</code>를 실행해 데이터를 생성하세요.
          </div>
        ) : (
          <Dashboard scores={scores} />
        )}

        <footer className="mt-auto pt-6 text-xs text-zinc-400">
          투자 조언이 아닙니다. 모든 점수와 내재가치 추정치는 참고용 계산 결과이며, 실제 투자 판단의 근거로 단독 사용하지 마세요.
        </footer>
      </main>
    </div>
  );
}

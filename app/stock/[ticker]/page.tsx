import Link from "next/link";
import { notFound } from "next/navigation";
import ScoreBadge from "@/components/ScoreBadge";
import CriteriaTable from "@/components/CriteriaTable";
import { getScoreByTicker } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const score = getScoreByTicker(ticker);

  if (!score) {
    notFound();
  }

  const qualityCriteria = score.criteria.filter((c) =>
    ["roe", "roic", "grossMargin", "debt", "epsConsistency", "fcf", "shareCount", "currentRatio"].includes(c.id)
  );
  const valuationCriteria = score.criteria.filter((c) => !qualityCriteria.includes(c));
  const iv = score.intrinsicValue;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← 전체 목록으로
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {score.ticker} <span className="text-lg font-normal text-zinc-500">{score.companyName}</span>
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {score.sector} · 주가 ${score.price.toFixed(2)}
              {score.isBuyCandidate && (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Buy Candidate
                </span>
              )}
            </p>
          </div>
          <ScoreBadge score={score.totalScore} max={100} />
        </header>

        <section className="grid grid-cols-1 gap-4 rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900 sm:grid-cols-3">
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">내재가치 (DCF, 주당)</div>
            <div className="text-xl font-semibold">{Number.isFinite(iv.intrinsicValuePerShare) ? `$${iv.intrinsicValuePerShare.toFixed(2)}` : "N/A"}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">현재가</div>
            <div className="text-xl font-semibold">${iv.currentPrice.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">안전마진</div>
            <div className={`text-xl font-semibold ${iv.marginOfSafety > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {Number.isFinite(iv.intrinsicValuePerShare) ? `${(iv.marginOfSafety * 100).toFixed(1)}%` : "N/A"}
            </div>
          </div>
          <div className="sm:col-span-3 text-xs text-zinc-400">
            소유주이익(Owner Earnings) 주당 {Number.isFinite(iv.ownerEarningsPerShare) ? `$${iv.ownerEarningsPerShare.toFixed(2)}` : "N/A (주식수 데이터 없음)"} 기준, 향후 5년 성장률 {(iv.growthRateUsed * 100).toFixed(1)}%,
            할인율 {(iv.discountRate * 100).toFixed(1)}%, 영구성장률 {(iv.terminalGrowthRate * 100).toFixed(1)}%로 추정한 단순 DCF 값입니다.
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CriteriaTable title="우량성 (Quality) — 50점" criteria={qualityCriteria} />
          <CriteriaTable title="저평가 / 안전마진 (Valuation) — 50점" criteria={valuationCriteria} />
        </div>

        <footer className="pt-4 text-xs text-zinc-400">
          투자 조언이 아닙니다. 모든 점수와 내재가치 추정치는 참고용 계산 결과이며, 실제 투자 판단의 근거로 단독 사용하지 마세요.
        </footer>
      </main>
    </div>
  );
}

import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ScoreBadge from "@/components/ScoreBadge";
import CriteriaTable from "@/components/CriteriaTable";
import TradingViewChart from "@/components/TradingViewChart";
import { getScoreByTicker } from "@/lib/store";
import { fetchCompanySummary } from "@/lib/wikipedia";
import { fetchRecentNews } from "@/lib/news";
import { fetchExchangeName, toTradingViewSymbol } from "@/lib/tradingview";
import universe from "@/data/universe.json";

export const dynamic = "force-dynamic";

const QUALITY_IDS = ["roe", "roic", "grossMargin", "debt", "epsConsistency", "fcf", "shareCount", "currentRatio"];

export default async function StockDetailPage({ params }: { params: Promise<{ locale: string; ticker: string }> }) {
  const { ticker } = await params;
  const score = getScoreByTicker(ticker);

  if (!score) {
    notFound();
  }

  const locale = await getLocale();
  const t = await getTranslations("stock");
  const tCommon = await getTranslations("common");
  const tSectors = await getTranslations("sectors");

  const meta = (universe as { ticker: string; wikiTitle: string | null }[]).find((u) => u.ticker === ticker);
  const [summary, news, exchangeName] = await Promise.all([
    // Wikipedia summaries are only sourced in English for now — translating
    // the underlying content per locale would need a separate ko-title
    // mapping, which isn't built yet.
    meta?.wikiTitle ? fetchCompanySummary(meta.wikiTitle) : Promise.resolve(null),
    fetchRecentNews(ticker),
    fetchExchangeName(ticker),
  ]);
  const tvSymbol = toTradingViewSymbol(ticker, exchangeName);

  const qualityCriteria = score.criteria.filter((c) => QUALITY_IDS.includes(c.id));
  const valuationCriteria = score.criteria.filter((c) => !QUALITY_IDS.includes(c.id));
  const iv = score.intrinsicValue;

  const pctFmt = (v: number) => new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  const usdFmt = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          {t("backToList")}
        </Link>

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {score.ticker} <span className="text-lg font-normal text-zinc-500">{score.companyName}</span>
            </h1>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">
              {tSectors(score.sector)} · {usdFmt(score.price)}
              {score.isBuyCandidate && (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                  {t("buyCandidate")}
                </span>
              )}
            </p>
          </div>
          <ScoreBadge score={score.totalScore} max={100} />
        </header>

        {summary && (
          <section className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="mb-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{t("companyOverview")}</h2>
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{summary}</p>
          </section>
        )}

        <section className="rounded-xl border border-black/10 bg-white p-2 dark:border-white/10 dark:bg-zinc-900 sm:p-4">
          <h2 className="mb-3 px-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400 sm:px-0">{t("priceChart")}</h2>
          <TradingViewChart symbol={tvSymbol} locale={locale} />
        </section>

        <section className="grid grid-cols-1 gap-4 rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900 sm:grid-cols-3">
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">{t("dcf.intrinsicValue")}</div>
            <div className="text-xl font-semibold">{Number.isFinite(iv.intrinsicValuePerShare) ? usdFmt(iv.intrinsicValuePerShare) : tCommon("notAvailable")}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">{t("dcf.currentPrice")}</div>
            <div className="text-xl font-semibold">{usdFmt(iv.currentPrice)}</div>
          </div>
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">{t("dcf.marginOfSafety")}</div>
            <div className={`text-xl font-semibold ${iv.marginOfSafety > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {Number.isFinite(iv.intrinsicValuePerShare) ? pctFmt(iv.marginOfSafety) : tCommon("notAvailable")}
            </div>
          </div>
          <div className="sm:col-span-3 text-xs text-zinc-400">
            {t("dcf.ownerEarningsNote", {
              value: Number.isFinite(iv.ownerEarningsPerShare) ? usdFmt(iv.ownerEarningsPerShare) : t("dcf.noShareData"),
              growth: pctFmt(iv.growthRateUsed),
              discount: pctFmt(iv.discountRate),
              terminal: pctFmt(iv.terminalGrowthRate),
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CriteriaTable title={t("quality.title", { max: 50 })} criteria={qualityCriteria} />
          <CriteriaTable title={t("valuation.title", { max: 50 })} criteria={valuationCriteria} />
        </div>

        <section className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{t("news.title")}</h2>
          {news.length === 0 ? (
            <p className="text-sm text-zinc-400">{t("news.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {news.map((n) => (
                <li key={n.link}>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {n.title}
                  </a>
                  <div className="text-xs text-zinc-400">
                    {n.publisher} · {new Date(n.publishedAt).toLocaleDateString(locale)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="pt-4 text-xs text-zinc-400">{tCommon("disclaimer")}</footer>
      </main>
    </div>
  );
}

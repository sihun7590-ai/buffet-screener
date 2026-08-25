import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import Panel from "@/components/Panel";
import BackToListLink from "@/components/BackToListLink";
import InfoTip from "@/components/InfoTip";
import ScoreBar from "@/components/ScoreBar";
import ScoreGauge from "@/components/ScoreGauge";
import StockFavoriteButton from "@/components/StockFavoriteButton";
import CriteriaTable from "@/components/CriteriaTable";
import PriceChartPanel from "@/components/PriceChartPanel";
import { getScoreByTicker } from "@/lib/store";
import { AXIS_WEIGHTS, SCORE_AXES } from "@/lib/types";
import { fetchCompanySummary } from "@/lib/wikipedia";
import { fetchRecentNews } from "@/lib/news";
import { fetchExchangeName, toTradingViewSymbol } from "@/lib/tradingview";
import universe from "@/data/universe.json";

export const dynamic = "force-dynamic";

export default async function StockDetailPage({ params }: { params: Promise<{ locale: string; ticker: string }> }) {
  const { ticker } = await params;
  const score = getScoreByTicker(ticker);

  if (!score) {
    notFound();
  }

  const locale = await getLocale();
  const t = await getTranslations("stock");
  const tAxes = await getTranslations("axes");
  const tGlossary = await getTranslations("glossary");
  const tCommon = await getTranslations("common");
  const tSectors = await getTranslations("sectors");

  const meta = (universe as { ticker: string; wikiTitle: string | null }[]).find((u) => u.ticker === ticker);
  const [summary, news, exchangeName] = await Promise.all([
    meta?.wikiTitle ? fetchCompanySummary(meta.wikiTitle, locale) : Promise.resolve(null),
    fetchRecentNews(ticker),
    fetchExchangeName(ticker),
  ]);
  const tvSymbol = toTradingViewSymbol(ticker, exchangeName);

  const iv = score.intrinsicValue;
  const ivOk = Number.isFinite(iv.intrinsicValuePerShare);
  const mosColor = iv.marginOfSafety > 0 ? "var(--up)" : "var(--down)";

  const pctFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  const usdFmt = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-7">
      <BackToListLink />

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-mono text-[32px] font-bold leading-none tracking-tight text-ink">
                {score.ticker}
              </h1>
              {score.isBuyCandidate && (
                <span className="flex items-center gap-1.5 rounded bg-up/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-up">
                  {t("buyCandidate")}
                  <InfoTip text={tGlossary("buyCandidate")} className="border-up/50 text-up" />
                </span>
              )}
              <StockFavoriteButton ticker={score.ticker} price={score.price} />
            </div>
            <p className="mt-2 text-[15px] font-medium text-ink-muted">{score.companyName}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded border border-line bg-subtle px-2 py-0.5 text-[11px] text-ink-muted">
                {tSectors(score.sector)}
              </span>
              {exchangeName && (
                <span className="rounded border border-line bg-subtle px-2 py-0.5 font-mono text-[11px] text-ink-faint">
                  {exchangeName}
                </span>
              )}
            </div>
            <div className="mt-5 flex items-baseline gap-2">
              <span className="font-mono text-[30px] font-bold leading-none tabular-nums text-ink">
                {usdFmt(score.price)}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                {t("dcf.currentPrice")}
                <InfoTip text={tGlossary("currentPrice")} />
              </span>
            </div>
          </div>

          {/* The breakdown sits beside the headline number rather than under
              it: the whole point of five axes is seeing *why* the total came
              out where it did without scrolling. */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
            <div className="flex flex-col gap-2.5">
              {SCORE_AXES.map((axis) => (
                <div key={axis}>
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                    {tAxes(`${axis}.name`)}
                    <span className="font-mono normal-case tracking-normal text-ink-faint/70">
                      {Math.round(AXIS_WEIGHTS[axis] * 100)}%
                    </span>
                    <InfoTip text={tAxes(`${axis}.tip`)} />
                  </div>
                  <ScoreBar score={score.scores[axis]} max={100} strong />
                </div>
              ))}
            </div>
            <div className="flex items-start gap-1.5">
              <ScoreGauge score={score.totalScore} max={100} label={t("stats.total")} />
              <InfoTip text={tGlossary("total")} />
            </div>
          </div>
        </div>
      </Panel>

      <PriceChartPanel symbol={tvSymbol} locale={locale} />

      <Panel
        title={
          <span className="flex items-center gap-1.5">
            {t("dcf.title")}
            <InfoTip text={tGlossary("marginOfSafety")} />
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-subtle px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {t("dcf.intrinsicValue")}
              <InfoTip text={tGlossary("intrinsicValue")} />
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-ink">
              {ivOk ? usdFmt(iv.intrinsicValuePerShare) : tCommon("notAvailable")}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-subtle px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {t("dcf.currentPrice")}
              <InfoTip text={tGlossary("currentPrice")} />
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-ink">{usdFmt(iv.currentPrice)}</div>
          </div>
          <div className="rounded-lg border border-line bg-subtle px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {t("dcf.marginOfSafety")}
              <InfoTip text={tGlossary("marginOfSafety")} />
            </div>
            <div
              className="mt-1.5 font-mono text-xl font-bold tabular-nums"
              style={{ color: ivOk ? mosColor : "var(--ink-faint)" }}
            >
              {ivOk ? pctFmt(iv.marginOfSafety) : tCommon("notAvailable")}
            </div>
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
          {t("dcf.ownerEarningsNote", {
            value: Number.isFinite(iv.ownerEarningsPerShare) ? usdFmt(iv.ownerEarningsPerShare) : t("dcf.noShareData"),
            growth: pctFmt(iv.growthRateUsed),
            discount: pctFmt(iv.discountRate),
            terminal: pctFmt(iv.terminalGrowthRate),
          })}
        </p>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SCORE_AXES.map((axis) => (
          <CriteriaTable
            key={axis}
            title={tAxes(`${axis}.name`)}
            titleTip={tAxes(`${axis}.tip`)}
            criteria={score.criteria.filter((c) => c.axis === axis)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {summary && (
          <Panel title={t("companyOverview")} className="lg:col-span-3">
            <p className="text-[13px] leading-relaxed text-ink-muted">{summary}</p>
          </Panel>
        )}

        <Panel title={t("news.title")} padded={false} className={summary ? "lg:col-span-2" : "lg:col-span-5"}>
          {news.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-ink-faint">{t("news.empty")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {news.map((n) => (
                <li key={n.link}>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-3 transition-colors hover:bg-surface-hover"
                  >
                    <span className="block text-[13px] font-medium leading-snug text-ink">{n.title}</span>
                    <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
                      <span className="font-medium text-ink-muted">{n.publisher}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(n.publishedAt).toLocaleDateString(locale)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <footer className="mt-auto border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
        {tCommon("disclaimer")}
      </footer>
    </main>
  );
}

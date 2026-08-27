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
import ScoreHistoryChart from "@/components/ScoreHistoryChart";
import DataSourceNote from "@/components/DataSourceNote";
import PeerComparison from "@/components/PeerComparison";
import InsiderActivity from "@/components/InsiderActivity";
import DcaSimulator from "@/components/DcaSimulator";
import ThesisPanel from "@/components/ThesisPanel";
import FairValuePanel from "@/components/FairValuePanel";
import { fetchScoreHistory } from "@/lib/scoreHistoryQuery";
import { computeFairValue } from "@/lib/fairValue";
import { buildThesis } from "@/lib/thesis";
import { comparePeers } from "@/lib/peers";
import { getScoreByTicker, readScores } from "@/lib/store";
import { AXIS_WEIGHTS, SCORE_AXES } from "@/lib/types";
import { fetchCompanySummary } from "@/lib/wikipedia";
import { fetchRecentNews } from "@/lib/news";
import { fetchInsiderTransactions } from "@/lib/insiderTrading";
import { fetchPriceHistory } from "@/lib/price";
import type { PricePoint } from "@/lib/dca";
import { fetchExchangeName, toTradingViewSymbol } from "@/lib/tradingview";
import universe from "@/data/universe.json";

export const dynamic = "force-dynamic";

// Yahoo's history endpoint occasionally 404s for thinly-covered tickers; the
// DCA panel just doesn't render rather than taking the whole page down with
// it, same treatment as fetchRecentNews/fetchInsiderTransactions below.
async function safePriceHistory(ticker: string) {
  try {
    return await fetchPriceHistory(ticker);
  } catch {
    return null;
  }
}

export default async function StockDetailPage({ params }: { params: Promise<{ locale: string; ticker: string }> }) {
  const { ticker } = await params;
  const score = getScoreByTicker(ticker);

  if (!score) {
    notFound();
  }

  const locale = await getLocale();
  const t = await getTranslations("stock");
  const tHistory = await getTranslations("history");
  const tAxes = await getTranslations("axes");
  const tGlossary = await getTranslations("glossary");
  const tCommon = await getTranslations("common");
  const tSectors = await getTranslations("sectors");
  const tSource = await getTranslations("dataSource");
  const { generatedAt, scores: allScores } = readScores();
  const peers = comparePeers(allScores, score.ticker);

  const meta = (universe as { ticker: string; wikiTitle: string | null }[]).find((u) => u.ticker === ticker);
  const [summary, news, insiderTransactions, exchangeName, history, priceHistory] = await Promise.all([
    meta?.wikiTitle ? fetchCompanySummary(meta.wikiTitle, locale) : Promise.resolve(null),
    fetchRecentNews(ticker),
    fetchInsiderTransactions(ticker),
    fetchExchangeName(ticker),
    fetchScoreHistory(ticker),
    safePriceHistory(ticker),
  ]);
  const tvSymbol = toTradingViewSymbol(ticker, exchangeName);

  // Yahoo's chart endpoint returns unix seconds and can carry null closes on
  // half-days; DCA math needs a dense ascending {date, close} series and
  // nothing else.
  const dcaPrices: PricePoint[] = priceHistory
    ? priceHistory.timestamps
        .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), close: priceHistory.closes[i] }))
        .filter((p): p is PricePoint => p.close != null)
    : [];

  const iv = score.intrinsicValue;
  // Regulated utilities routinely spend more on plant than they take in, so
  // owner earnings — and the discounted value built on them — come out
  // negative. That is a real reading and the margin-of-safety criterion scores
  // it at the floor, but "intrinsic value: -$63" on screen means nothing to a
  // reader. The model doesn't apply here; say so instead of printing it.
  const ivOk = Number.isFinite(iv.intrinsicValuePerShare) && iv.intrinsicValuePerShare > 0;
  const mosColor = iv.marginOfSafety > 0 ? "var(--up)" : "var(--down)";

  const pctFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  const usdFmt = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-7">
      <BackToListLink />

      <section
        className="flex flex-wrap items-center gap-4 rounded-[20px] border border-panel-border p-[22px]"
        style={{ background: "linear-gradient(140deg,#181330,#101015 60%)" }}
      >
        <span className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-2xl border border-panel-border bg-[#191428] font-mono text-[16px] font-bold text-brand-text-2">
          {score.ticker.slice(0, 2)}
        </span>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[26px] font-bold leading-none tracking-tight text-ink">{score.ticker}</span>
            {score.isBuyCandidate && (
              <span className="flex items-center gap-1.5 rounded-[6px] bg-up/15 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-up">
                {t("buyCandidate")}
                <InfoTip text={tGlossary("buyCandidate")} className="border-up/50 text-up" />
              </span>
            )}
            <span className="rounded-[6px] border border-border-3 bg-surface-4 px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
              {tSectors(score.sector)}
            </span>
          </div>
          <span className="text-[13px] text-ink-muted">
            {score.companyName}
            {exchangeName ? ` · ${exchangeName}` : ""}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-6">
          <span className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-ink-4">
              {t("dcf.currentPrice")}
              <InfoTip text={tGlossary("currentPrice")} />
            </span>
            <span className="font-mono text-[26px] font-bold tabular-nums text-ink">{usdFmt(score.price)}</span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-4">{t("dcf.intrinsicValue")}</span>
            <span className="font-mono text-[26px] font-bold tabular-nums text-brand-text">
              {ivOk ? usdFmt(iv.intrinsicValuePerShare) : tCommon("notAvailable")}
            </span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-4">{t("dcf.marginOfSafety")}</span>
            <span className="font-mono text-[26px] font-bold tabular-nums" style={{ color: ivOk ? mosColor : "var(--ink-faint)" }}>
              {ivOk ? pctFmt(iv.marginOfSafety) : tCommon("notAvailable")}
            </span>
          </span>
          <StockFavoriteButton ticker={score.ticker} price={score.price} variant="prominent" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-bold text-ink-2">{t("breakdown")}</span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-[28px] font-bold tabular-nums text-ink">{score.totalScore.toFixed(1)}</span>
              <span className="text-[13px] text-ink-faint">/100</span>
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
            {SCORE_AXES.map((axis) => {
              // Older snapshots predate coverage tracking; absent means the
              // axis was scored on everything, which is what full means.
              const covered = score.coverage?.[axis] ?? 1;
              return (
                <div key={axis} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-1.5 text-[11px] font-semibold text-ink-2">
                    <span className="flex items-center gap-1">
                      {tAxes(`${axis}.name`)}
                      <InfoTip text={tAxes(`${axis}.tip`)} />
                    </span>
                    <span className="text-[10px] font-normal text-ink-faint">{Math.round(AXIS_WEIGHTS[axis] * 100)}%</span>
                  </div>
                  <ScoreBar score={score.scores[axis]} max={100} strong />
                  {covered < 1 && (
                    <span className="flex items-center gap-1 self-start rounded border border-warn/40 px-1 py-px font-mono text-[9px] text-warn">
                      {tSource("coverage", { percent: Math.round(covered * 100) })}
                      <InfoTip text={tSource("coverageTip")} className="border-warn/50 text-warn" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <div className="flex items-center justify-center rounded-[20px] border border-line bg-surface p-5">
          <div className="flex items-start gap-1.5">
            <ScoreGauge score={score.totalScore} max={100} label={t("stats.total")} />
            <InfoTip text={tGlossary("total")} />
          </div>
        </div>
      </div>

      <Panel>
        <DataSourceNote provenance={score.dataSource} generatedAt={generatedAt} />
      </Panel>

      {/* Sits directly under the breakdown because it answers the question the
          breakdown raises — five axis bars say what the score is, this says
          which criteria drove it and in which direction. */}
      <ThesisPanel thesis={buildThesis(score)} />

      {/* Two points is the minimum that can show a direction; below that a
          chart would be a dot, so the panel simply doesn't appear. */}
      {history.length >= 2 && (
        <Panel
          title={
            <span className="flex items-center gap-1.5">
              {tHistory("title")}
              <InfoTip text={tHistory("tip")} />
            </span>
          }
        >
          <ScoreHistoryChart points={history} />
        </Panel>
      )}

      {peers && <PeerComparison comparison={peers} />}

      <PriceChartPanel symbol={tvSymbol} locale={locale} />

      {dcaPrices.length >= 2 && <DcaSimulator prices={dcaPrices} currentPrice={score.price} />}

      {/* Replaces the single-DCF panel this page used to carry. That panel's
          three figures are all still here — as the first row and the DCF row —
          alongside three more methods and what they disagree about. */}
      <FairValuePanel summary={computeFairValue(score)} />

      {!ivOk && Number.isFinite(iv.ownerEarningsPerShare) && iv.ownerEarningsPerShare <= 0 && (
        <Panel>
          <p className="text-[12px] leading-relaxed text-warn">{t("dcf.negativeOwnerEarnings")}</p>
        </Panel>
      )}

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

      <InsiderActivity transactions={insiderTransactions} />

      <footer className="mt-auto border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
        {tCommon("disclaimer")}
      </footer>
    </main>
  );
}

import { getTranslations } from "next-intl/server";
import BackToListLink from "@/components/BackToListLink";
import BacktestChart from "@/components/BacktestChart";
import Panel from "@/components/Panel";
import InfoTip from "@/components/InfoTip";
import { readBacktest } from "@/lib/backtestStore";
import { sharpeRatio, trailingReturn, yearlyReturns, type StrategyId } from "@/lib/backtest";

// data/backtest.json changes whenever `npm run backtest` runs; read it fresh
// on every request instead of baking it into the build (same reasoning as
// the main screener page reading data/scores.json).
export const dynamic = "force-dynamic";

const STRATEGY_ORDER: StrategyId[] = ["buyCandidate", "top20", "universe", "spy"];

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export default async function BacktestPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "backtest" });
  const tCommon = await getTranslations({ locale, namespace: "common" });

  const result = readBacktest();

  const strategies = result
    ? STRATEGY_ORDER.map((id) => result.strategies.find((s) => s.id === id)).filter((s) => s != null)
    : [];

  // "Top 20" headlines the KPI row and period-detail table — it's the
  // strategy the redesign's prototype describes ("상위 20종목 동일가중"). The
  // full 4-strategy table below is unchanged and still compares all of them.
  const headline = strategies.find((s) => s.id === "top20") ?? null;
  const benchmark = strategies.find((s) => s.id === "spy") ?? null;
  const headlineSharpe = headline ? sharpeRatio(headline.quarters) : 0;
  const headlineYears = headline ? yearlyReturns(headline.quarters) : [];
  const maxYearlyAbs = Math.max(0.01, ...headlineYears.map((y) => Math.abs(y.return)));

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <BackToListLink />

      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{t("title")}</h1>
        <p className="max-w-3xl text-[13px] leading-relaxed text-ink-muted">{t("subtitle")}</p>
      </div>

      {/* Prominent, not buried in a footer — this is the single most
          important caveat about every number on this page. */}
      <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] leading-relaxed text-warn">
        {t.rich("survivorshipBanner", {
          strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
        })}
      </div>

      {!result || strategies.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-16 text-center text-sm text-ink-muted">
          {t.rich("emptyState", {
            code: (chunks) => (
              <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-ink">{chunks}</code>
            ),
          })}
        </div>
      ) : (
        <>
          {headline && (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">{t("kpi.headline")}</span>
              <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-[18px]">
                  <span className="text-[11px] font-semibold text-ink-4">{t("kpi.totalReturn")}</span>
                  <span className="font-mono text-[26px] font-bold tabular-nums" style={{ color: headline.totalReturn >= 0 ? "var(--up)" : "var(--down)" }}>
                    {pct(headline.totalReturn)}
                  </span>
                  {benchmark && <span className="text-[11px] text-ink-faint">{t("kpi.benchmarkNote", { value: pct(benchmark.totalReturn) })}</span>}
                </div>
                <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-[18px]">
                  <span className="text-[11px] font-semibold text-ink-4">{t("kpi.cagr")}</span>
                  <span className="font-mono text-[26px] font-bold tabular-nums text-ink">{pct(headline.cagr)}</span>
                  {benchmark && <span className="text-[11px] text-ink-faint">{t("kpi.benchmarkNote", { value: pct(benchmark.cagr) })}</span>}
                </div>
                <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-[18px]">
                  <span className="text-[11px] font-semibold text-ink-4">{t("kpi.maxDrawdown")}</span>
                  <span className="font-mono text-[26px] font-bold tabular-nums text-down">{pct(headline.maxDrawdown)}</span>
                  {benchmark && <span className="text-[11px] text-ink-faint">{t("kpi.benchmarkNote", { value: pct(benchmark.maxDrawdown) })}</span>}
                </div>
                <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-[18px]">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-4">
                    {t("kpi.sharpe")}
                    <InfoTip text={t("tip.sharpe")} />
                  </span>
                  <span className="font-mono text-[26px] font-bold tabular-nums text-ink">{headlineSharpe.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}

          <Panel title={t("summaryTitle")} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse whitespace-nowrap text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      {t("table.strategy")}
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {t("table.totalReturn")}
                        <InfoTip text={t("tip.totalReturn")} />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {t("table.cagr")}
                        <InfoTip text={t("tip.cagr")} />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {t("table.maxDrawdown")}
                        <InfoTip text={t("tip.maxDrawdown")} />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {t("table.quarters")}
                        <InfoTip text={t("tip.quarters")} />
                      </span>
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {t("table.holdings")}
                        <InfoTip text={t("tip.holdings")} />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {strategies.map((s) => (
                    <tr key={s.id} className="border-b border-line/60 last:border-b-0">
                      <td className="px-4 py-2.5 text-[13px] font-semibold text-ink">
                        <span className="inline-flex items-center gap-1.5">
                          {t(`series.${s.id}`)}
                          {s.id === "universe" && <InfoTip text={t("tip.universe")} />}
                          {s.id === "spy" && <InfoTip text={t("tip.spy")} />}
                        </span>
                      </td>
                      <td
                        className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums"
                        style={{ color: s.totalReturn >= 0 ? "var(--up)" : "var(--down)" }}
                      >
                        {pct(s.totalReturn)}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums"
                        style={{ color: s.cagr >= 0 ? "var(--up)" : "var(--down)" }}
                      >
                        {pct(s.cagr)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-down">
                        {pct(s.maxDrawdown)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink-muted">
                        +{s.positiveQuarters}/-{s.negativeQuarters}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink-muted">
                        {s.minHoldings != null ? `${s.minHoldings}~${s.maxHoldings}` : t("table.holdingsNa")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            title={
              <span className="flex items-center gap-1.5">
                {t("chartTitle")}
                <InfoTip text={t("tip.chart")} />
              </span>
            }
          >
            <BacktestChart strategies={strategies} quarterDates={result.quarterDates} />
          </Panel>

          {headline && benchmark && (
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
              <Panel title={t("yearlyReturns.title")}>
                <div className="flex h-[150px] items-end gap-2">
                  {headlineYears.map((y) => (
                    <span key={y.year} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="font-mono text-[9px] font-semibold" style={{ color: y.return >= 0 ? "var(--brand-text)" : "var(--down)" }}>
                        {pct(y.return)}
                      </span>
                      <span
                        className="block w-full rounded-t-[6px] rounded-b-[3px]"
                        style={{
                          height: `${Math.max(6, (Math.abs(y.return) / maxYearlyAbs) * 100)}%`,
                          background: y.return >= 0 ? "var(--brand)" : "var(--down)",
                        }}
                      />
                      <span className="font-mono text-[9px] text-ink-6">{y.year}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">{t("yearlyReturns.note")}</p>
              </Panel>

              <Panel title={t("periodDetail.title")}>
                <div className="flex flex-col">
                  {[
                    {
                      label: t("periodDetail.trailing1y"),
                      port: trailingReturn(headline.quarters, 4),
                      bench: trailingReturn(benchmark.quarters, 4),
                    },
                    { label: t("periodDetail.allTime"), port: headline.totalReturn, bench: benchmark.totalReturn },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between border-b border-divider-2 py-[11px]">
                      <span className="text-[12px] font-semibold text-ink-2">{row.label}</span>
                      <span className="flex items-center gap-5">
                        <span
                          className="w-[70px] text-right font-mono text-[13px] font-bold tabular-nums"
                          style={{ color: row.port >= 0 ? "var(--up)" : "var(--down)" }}
                        >
                          {pct(row.port)}
                        </span>
                        <span className="w-[70px] text-right font-mono text-[13px] tabular-nums text-ink-muted">{pct(row.bench)}</span>
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-[11px]">
                    <span className="text-[12px] font-semibold text-ink-2">{t("periodDetail.winRate")}</span>
                    <span className="flex items-center gap-5">
                      <span className="w-[70px] text-right font-mono text-[13px] font-bold tabular-nums text-ink">
                        {headline.positiveQuarters}/{headline.positiveQuarters + headline.negativeQuarters}
                      </span>
                      <span className="w-[70px] text-right font-mono text-[13px] tabular-nums text-ink-muted">
                        {benchmark.positiveQuarters}/{benchmark.positiveQuarters + benchmark.negativeQuarters}
                      </span>
                    </span>
                  </div>
                </div>
              </Panel>
            </div>
          )}
        </>
      )}

      <footer className="mt-auto flex flex-col gap-2 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
        <p>{t("scopeNote")}</p>
        <p>{tCommon("disclaimer")}</p>
      </footer>
    </main>
  );
}

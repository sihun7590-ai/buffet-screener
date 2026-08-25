import { getTranslations } from "next-intl/server";
import BackToListLink from "@/components/BackToListLink";
import BacktestChart from "@/components/BacktestChart";
import Panel from "@/components/Panel";
import InfoTip from "@/components/InfoTip";
import { readBacktest } from "@/lib/backtestStore";
import type { StrategyId } from "@/lib/backtest";

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

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <BackToListLink />

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{t("title")}</h1>
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
        <div className="rounded-xl border border-line bg-surface p-16 text-center text-sm text-ink-muted shadow-[var(--shadow)]">
          {t.rich("emptyState", {
            code: (chunks) => (
              <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-ink">{chunks}</code>
            ),
          })}
        </div>
      ) : (
        <>
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
        </>
      )}

      <footer className="mt-auto flex flex-col gap-2 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
        <p>{t("scopeNote")}</p>
        <p>{tCommon("disclaimer")}</p>
      </footer>
    </main>
  );
}

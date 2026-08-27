"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PortfolioSummary } from "@/lib/portfolio";
import { SCORE_AXES } from "@/lib/types";
import Panel from "./Panel";
import InfoTip from "./InfoTip";
import ScoreBar, { scoreColor } from "./ScoreBar";

interface Draft {
  ticker: string;
  shares: string;
  averageCost: string;
  note: string;
}

const EMPTY: Draft = { ticker: "", shares: "", averageCost: "", note: "" };

export default function PortfolioPanel({
  summary,
  userId,
  knownTickers,
}: {
  summary: PortfolioSummary;
  userId: string;
  knownTickers: string[];
}) {
  const t = useTranslations("mypage.portfolio");
  const tSectors = useTranslations("sectors");
  const tAxes = useTranslations("axes");
  const locale = useLocale();
  const router = useRouter();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const usd = (v: number) =>
    Number.isFinite(v) ? new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v) : "—";
  const pct = (v: number) =>
    Number.isFinite(v)
      ? new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)
      : "—";
  const qty = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(v);

  const tone = (v: number) => (!Number.isFinite(v) ? "text-ink-muted" : v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink-muted");

  const submit = () => {
    const ticker = draft.ticker.trim().toUpperCase();
    const shares = Number(draft.shares);
    const averageCost = Number(draft.averageCost);

    // Validated here rather than left to the database's CHECK constraints: a
    // Postgres error surfaces as an opaque failure, and "shares must be above
    // zero" is something the person typing can act on immediately.
    if (!ticker) return setError(t("errors.tickerRequired"));
    if (!knownTickers.includes(ticker)) return setError(t("errors.unknownTicker", { ticker }));
    if (!Number.isFinite(shares) || shares <= 0) return setError(t("errors.sharesPositive"));
    if (!Number.isFinite(averageCost) || averageCost < 0) return setError(t("errors.costNonNegative"));

    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      // Upsert on (user_id, ticker): adding to a position you already hold
      // replaces the row. Adding lots would need its own model and a reason to
      // want one, and neither exists yet.
      const { error: dbError } = await supabase.from("holdings").upsert(
        {
          user_id: userId,
          ticker,
          shares,
          average_cost: averageCost,
          note: draft.note.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,ticker" },
      );
      if (dbError) {
        setError(dbError.message);
        return;
      }
      setDraft(EMPTY);
      setFormOpen(false);
      router.refresh();
    });
  };

  const remove = (ticker: string) => {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.from("holdings").delete().eq("user_id", userId).eq("ticker", ticker);
      router.refresh();
    });
  };

  const edit = (ticker: string) => {
    const p = summary.positions.find((x) => x.ticker === ticker);
    if (!p) return;
    setDraft({ ticker: p.ticker, shares: String(p.shares), averageCost: String(p.averageCost), note: p.note ?? "" });
    setFormOpen(true);
    setError(null);
  };

  const hasPositions = summary.positions.length > 0;

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip text={t("tip")} />
        </span>
      }
      trailing={
        <button
          type="button"
          onClick={() => {
            setFormOpen((v) => !v);
            setDraft(EMPTY);
            setError(null);
          }}
          className="h-8 rounded-[10px] border border-brand-border bg-brand-soft px-3 text-[12px] font-semibold text-brand-text-2 transition-opacity hover:opacity-90"
        >
          {formOpen ? t("cancel") : t("addPosition")}
        </button>
      }
    >
      {formOpen && (
        <div className="mb-4 flex flex-col gap-2.5 rounded-lg border border-line bg-subtle p-3.5">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">{t("fields.ticker")}</span>
              <input
                list="portfolio-tickers"
                value={draft.ticker}
                onChange={(e) => setDraft((d) => ({ ...d, ticker: e.target.value.toUpperCase() }))}
                className="h-9 w-[110px] rounded-[10px] border border-line-strong bg-surface-3 px-2.5 font-mono text-[13px] text-ink outline-none"
              />
              <datalist id="portfolio-tickers">
                {knownTickers.map((tk) => (
                  <option key={tk} value={tk} />
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">{t("fields.shares")}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={draft.shares}
                onChange={(e) => setDraft((d) => ({ ...d, shares: e.target.value }))}
                className="h-9 w-[100px] rounded-[10px] border border-line-strong bg-surface-3 px-2.5 text-right font-mono text-[13px] tabular-nums text-ink outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">{t("fields.averageCost")}</span>
              <input
                type="number"
                step="any"
                min="0"
                value={draft.averageCost}
                onChange={(e) => setDraft((d) => ({ ...d, averageCost: e.target.value }))}
                className="h-9 w-[110px] rounded-[10px] border border-line-strong bg-surface-3 px-2.5 text-right font-mono text-[13px] tabular-nums text-ink outline-none"
              />
            </label>
            <label className="flex min-w-[160px] flex-1 flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">{t("fields.note")}</span>
              <input
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                maxLength={200}
                placeholder={t("fields.notePlaceholder")}
                className="h-9 w-full rounded-[10px] border border-line-strong bg-surface-3 px-2.5 text-[12px] text-ink outline-none placeholder:text-ink-faint"
              />
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="h-9 rounded-[10px] bg-brand px-4 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
          {error && <p className="text-[12px] text-down">{error}</p>}
          <p className="text-[11px] leading-relaxed text-ink-faint">{t("upsertNote")}</p>
        </div>
      )}

      {!hasPositions ? (
        <p className="py-6 text-center text-[13px] text-ink-faint">{t("empty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg border border-line bg-subtle px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{t("summary.marketValue")}</div>
              <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-ink">{usd(summary.marketValue)}</div>
            </div>
            <div className="rounded-lg border border-line bg-subtle px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{t("summary.costBasis")}</div>
              <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-ink-muted">{usd(summary.costBasis)}</div>
            </div>
            <div className="rounded-lg border border-line bg-subtle px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{t("summary.gain")}</div>
              <div className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${tone(summary.gain)}`}>
                {usd(summary.gain)} <span className="text-[13px]">({pct(summary.gainPercent)})</span>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-subtle px-4 py-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {t("summary.weightedScore")}
                <InfoTip text={t("summary.weightedScoreTip")} />
              </div>
              <div
                className="mt-1.5 font-mono text-xl font-bold tabular-nums"
                style={{ color: scoreColor(summary.weightedScore, 100) }}
              >
                {Number.isFinite(summary.weightedScore) ? summary.weightedScore.toFixed(1) : "—"}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                    <th className="px-2 py-2 text-left font-semibold">{t("columns.position")}</th>
                    <th className="px-2 py-2 text-right font-semibold">{t("columns.shares")}</th>
                    <th className="px-2 py-2 text-right font-semibold">{t("columns.averageCost")}</th>
                    <th className="px-2 py-2 text-right font-semibold">{t("columns.currentPrice")}</th>
                    <th className="px-2 py-2 text-right font-semibold">{t("columns.marketValue")}</th>
                    <th className="px-2 py-2 text-right font-semibold">{t("columns.gain")}</th>
                    <th className="px-2 py-2 text-right font-semibold">{t("columns.weight")}</th>
                    <th className="px-2 py-2 text-right font-semibold">{t("columns.score")}</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {summary.positions.map((p) => (
                    <tr key={p.ticker} className="hover:bg-subtle">
                      <td className="px-2 py-2.5 text-left">
                        <span className="font-mono text-[12px] font-bold text-ink">{p.ticker}</span>
                        <span className="ml-2 text-[11px] text-ink-faint">{p.companyName}</span>
                        {p.note && <p className="mt-0.5 text-[11px] italic text-ink-faint">{p.note}</p>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-muted">{qty(p.shares)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-muted">{usd(p.averageCost)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink">{usd(p.currentPrice)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12px] font-semibold tabular-nums text-ink">{usd(p.marketValue)}</td>
                      <td className={`whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12px] tabular-nums ${tone(p.gain)}`}>
                        {pct(p.gainPercent)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-muted">{pct(p.weight)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12px] tabular-nums">
                        <span style={{ color: scoreColor(p.totalScore, 100) }}>
                          {Number.isFinite(p.totalScore) ? p.totalScore.toFixed(1) : "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => edit(p.ticker)}
                          className="px-1.5 text-[11px] text-ink-faint transition-colors hover:text-ink"
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(p.ticker)}
                          disabled={pending}
                          className="px-1.5 text-[11px] text-ink-faint transition-colors hover:text-down disabled:opacity-50"
                        >
                          {t("remove")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">{t("sectorExposure")}</h4>
                <ul className="mt-2 flex flex-col gap-2">
                  {summary.sectors.map((s) => (
                    <li key={s.sector || "unknown"} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="truncate text-ink-muted">{s.sector ? tSectors(s.sector) : t("unknownSector")}</span>
                        <span className="shrink-0 font-mono tabular-nums text-ink">{pct(s.weight)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${s.weight * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-faint">
                  {t("axisProfile")}
                  <InfoTip text={t("axisProfileTip")} />
                </h4>
                <ul className="mt-2 flex flex-col gap-2">
                  {SCORE_AXES.map((axis) => (
                    <li key={axis} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-ink-muted">{tAxes(`${axis}.name`)}</span>
                      <ScoreBar score={summary.weightedAxes[axis]} max={100} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {summary.unscored.length > 0 && (
            <p className="mt-3.5 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-warn">
              {t("unscored", { tickers: summary.unscored.join(", ") })}
            </p>
          )}

          <p className="mt-3.5 text-[11px] leading-relaxed text-ink-faint">{t("note")}</p>
        </>
      )}
    </Panel>
  );
}

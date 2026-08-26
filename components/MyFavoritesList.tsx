"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import Panel from "./Panel";
import { scoreColor } from "./ScoreBar";

export interface MyFavoriteRow {
  ticker: string;
  companyName: string;
  sector: string;
  totalScore: number;
  isBuyCandidate: boolean;
  marginOfSafety: number;
  priceAtFavorite: number;
  currentPrice: number;
  favoritedAt: string;
}

export default function MyFavoritesList({ userId, initialRows }: { userId: string; initialRows: MyFavoriteRow[] }) {
  const t = useTranslations("mypage");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [rows, setRows] = useState(initialRows);

  const priceFmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const remove = async (ticker: string) => {
    setRows((prev) => prev.filter((r) => r.ticker !== ticker));
    await createClient().from("favorites").delete().eq("user_id", userId).eq("ticker", ticker);
  };

  if (rows.length === 0) {
    return (
      <Panel>
        <div className="py-10 text-center text-sm text-ink-muted">{t("empty")}</div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
      {rows.map((r) => {
        const changeOk = Number.isFinite(r.currentPrice) && Number.isFinite(r.priceAtFavorite) && r.priceAtFavorite !== 0;
        const change = changeOk ? (r.currentPrice - r.priceAtFavorite) / r.priceAtFavorite : NaN;
        const scoreOk = Number.isFinite(r.totalScore);
        const totalColor = scoreOk ? scoreColor(r.totalScore, 100) : "var(--ink-faint)";
        const mosOk = Number.isFinite(r.marginOfSafety);

        return (
          <div
            key={r.ticker}
            className="flex flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-[18px] transition-colors hover:border-brand-border"
          >
            <div className="flex items-center gap-2.5">
              <Link href={`/stock/${r.ticker}`} className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-border-3 bg-surface-4 font-mono text-[11px] font-bold text-ink-muted">
                  {r.ticker.slice(0, 2)}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-[15px] font-bold text-ink">{r.ticker}</span>
                  <span className="block max-w-[150px] truncate text-[11px] text-ink-4">{r.companyName}</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => remove(r.ticker)}
                title={t("table.remove")}
                className="ml-auto shrink-0 text-brand transition-transform hover:scale-110"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M10 16.5S3.8 12.4 3.8 8A3.6 3.6 0 0 1 10 5.6 3.6 3.6 0 0 1 16.2 8c0 4.4-6.2 8.5-6.2 8.5Z" />
                </svg>
              </button>
            </div>

            <div className="flex items-end justify-between">
              <span className="flex items-baseline gap-2">
                <span className="font-mono text-[24px] font-bold tabular-nums" style={{ color: totalColor }}>
                  {scoreOk ? r.totalScore.toFixed(1) : tCommon("notAvailable")}
                </span>
                {changeOk && (
                  <span className="font-mono text-[12px] font-bold" style={{ color: change >= 0 ? "var(--up)" : "var(--down)" }}>
                    {change >= 0 ? "+" : ""}
                    {(change * 100).toFixed(1)}%
                  </span>
                )}
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] text-ink-4">{t("card.marginOfSafety")}</span>
                <span
                  className="font-mono text-[14px] font-bold tabular-nums"
                  style={{ color: mosOk ? (r.marginOfSafety > 0 ? "var(--up)" : "var(--down)") : "var(--ink-faint)" }}
                >
                  {mosOk ? `${r.marginOfSafety > 0 ? "+" : ""}${(r.marginOfSafety * 100).toFixed(1)}%` : tCommon("notAvailable")}
                </span>
              </span>
            </div>

            <span className="block h-1.5 overflow-hidden rounded-full bg-border-2">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.totalScore))}%`, background: totalColor }} />
            </span>

            <div className="flex items-center justify-between border-t border-divider pt-3 text-[11px] text-ink-4">
              <span>
                {t("card.priceAtFavorite")} <span className="font-mono text-ink-muted">${priceFmt.format(r.priceAtFavorite)}</span>
              </span>
              <span>
                {t("card.currentPrice")}{" "}
                <span className="font-mono text-ink-muted">
                  {Number.isFinite(r.currentPrice) ? `$${priceFmt.format(r.currentPrice)}` : tCommon("notAvailable")}
                </span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

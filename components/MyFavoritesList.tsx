"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import Panel from "./Panel";
import ScoreBar from "./ScoreBar";
import FavoriteButton from "./FavoriteButton";
import InfoTip from "./InfoTip";

function Th({ label, tip, align = "left" }: { label: string; tip: string; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
        <span>{label}</span>
        <InfoTip text={tip} />
      </span>
    </th>
  );
}

export interface MyFavoriteRow {
  ticker: string;
  companyName: string;
  sector: string;
  totalScore: number;
  isBuyCandidate: boolean;
  priceAtFavorite: number;
  currentPrice: number;
  favoritedAt: string;
}

export default function MyFavoritesList({ userId, initialRows }: { userId: string; initialRows: MyFavoriteRow[] }) {
  const t = useTranslations("mypage");
  const tGlossary = useTranslations("glossary");
  const tCommon = useTranslations("common");
  const tSectors = useTranslations("sectors");
  const locale = useLocale();
  const [rows, setRows] = useState(initialRows);

  const priceFmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

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
    <Panel padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse whitespace-nowrap text-left">
          <thead className="bg-subtle">
            <tr className="border-b border-line">
              <th className="w-9 px-3 py-2.5" />
              <Th label={t("table.stock")} tip={tGlossary("stock")} />
              <Th label={t("table.score")} tip={tGlossary("total")} />
              <Th label={t("table.priceAtFavorite")} tip={tGlossary("priceAtFavorite")} align="right" />
              <Th label={t("table.currentPrice")} tip={tGlossary("currentPrice")} align="right" />
              <Th label={t("table.change")} tip={tGlossary("change")} align="right" />
              <Th label={t("table.favoritedAt")} tip={tGlossary("favoritedAt")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const changeOk = Number.isFinite(r.currentPrice) && Number.isFinite(r.priceAtFavorite) && r.priceAtFavorite !== 0;
              const change = changeOk ? (r.currentPrice - r.priceAtFavorite) / r.priceAtFavorite : NaN;
              return (
                <tr key={r.ticker} className="border-b border-line/60 last:border-b-0">
                  <td className="px-3 py-3">
                    <FavoriteButton
                      size="sm"
                      active
                      title={t("table.remove")}
                      className="text-down"
                      onToggle={() => remove(r.ticker)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/stock/${r.ticker}`} className="flex items-center gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-subtle font-mono text-[10px] font-bold text-ink-muted">
                        {r.ticker.slice(0, 2)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-[13px] font-bold text-ink hover:text-brand">{r.ticker}</span>
                          {r.isBuyCandidate && (
                            <span className="rounded bg-up/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-up">
                              Buy
                            </span>
                          )}
                        </span>
                        <span className="block max-w-[180px] truncate text-[11px] text-ink-faint">
                          {r.companyName} · {tSectors(r.sector)}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <ScoreBar score={r.totalScore} max={100} />
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums text-ink-muted">
                    ${priceFmt.format(r.priceAtFavorite)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] tabular-nums text-ink">
                    {Number.isFinite(r.currentPrice) ? `$${priceFmt.format(r.currentPrice)}` : tCommon("notAvailable")}
                  </td>
                  <td
                    className="px-3 py-3 text-right font-mono text-[13px] font-semibold tabular-nums"
                    style={{ color: changeOk ? (change >= 0 ? "var(--up)" : "var(--down)") : "var(--ink-faint)" }}
                  >
                    {changeOk ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%` : tCommon("notAvailable")}
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] tabular-nums text-ink-faint">
                    {dateFmt.format(new Date(r.favoritedAt))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

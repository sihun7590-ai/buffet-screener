"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { StockScore } from "@/lib/types";
import ScoreBadge from "./ScoreBadge";

type SortKey = "totalScore" | "qualityScore" | "valuationScore" | "marketCap";
const ALL_SECTORS = "";

function formatMarketCap(v: number) {
  if (v >= 1_000_000_000_000) return `$${(v / 1_000_000_000_000).toFixed(2)}T`;
  return `$${(v / 1_000_000_000).toFixed(1)}B`;
}

export default function Dashboard({ scores }: { scores: StockScore[] }) {
  const t = useTranslations("dashboard");
  const tSectors = useTranslations("sectors");
  const [sector, setSector] = useState(ALL_SECTORS);
  const [minScore, setMinScore] = useState(0);
  const [buyOnly, setBuyOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("totalScore");

  const sectorLabel = (s: string) => (s === ALL_SECTORS ? t("filters.allSectors") : tSectors(s));
  const sectors = useMemo(() => [ALL_SECTORS, ...Array.from(new Set(scores.map((s) => s.sector))).sort()], [scores]);

  const filtered = useMemo(() => {
    return scores
      .filter((s) => sector === ALL_SECTORS || s.sector === sector)
      .filter((s) => s.totalScore >= minScore)
      .filter((s) => !buyOnly || s.isBuyCandidate)
      .sort((a, b) => b[sortKey] - a[sortKey]);
  }, [scores, sector, minScore, buyOnly, sortKey]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">{t("filters.sector")}</span>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/15"
          >
            {sectors.map((s) => (
              <option key={s} value={s}>
                {sectorLabel(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">{t("filters.minScore", { score: minScore })}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-40"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={buyOnly} onChange={(e) => setBuyOnly(e.target.checked)} />
          <span>{t("filters.buyCandidateOnly")}</span>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">{t("filters.sortBy")}</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-black/10 bg-transparent px-2 py-1.5 dark:border-white/15"
          >
            <option value="totalScore">{t("filters.sort.totalScore")}</option>
            <option value="qualityScore">{t("filters.sort.qualityScore")}</option>
            <option value="valuationScore">{t("filters.sort.valuationScore")}</option>
            <option value="marketCap">{t("filters.sort.marketCap")}</option>
          </select>
        </label>

        <span className="ml-auto text-sm text-zinc-500 dark:text-zinc-400">{t("tickerCount", { count: filtered.length })}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">{t("table.ticker")}</th>
              <th className="px-4 py-3 font-medium">{t("table.company")}</th>
              <th className="px-4 py-3 font-medium">{t("table.sector")}</th>
              <th className="px-4 py-3 font-medium">{t("table.price")}</th>
              <th className="px-4 py-3 font-medium">{t("table.marketCap")}</th>
              <th className="px-4 py-3 font-medium">{t("table.quality")}</th>
              <th className="px-4 py-3 font-medium">{t("table.valuation")}</th>
              <th className="px-4 py-3 font-medium">{t("table.total")}</th>
              <th className="px-4 py-3 font-medium">{t("table.marginOfSafety")}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.ticker} className="border-t border-black/5 hover:bg-zinc-50 dark:border-white/5 dark:hover:bg-zinc-900/60">
                <td className="px-4 py-3 font-semibold">{s.ticker}</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">{s.companyName}</td>
                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{tSectors(s.sector)}</td>
                <td className="px-4 py-3">${s.price.toFixed(2)}</td>
                <td className="px-4 py-3">{formatMarketCap(s.marketCap)}</td>
                <td className="px-4 py-3">
                  <ScoreBadge score={s.qualityScore} max={50} />
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={s.valuationScore} max={50} />
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={s.totalScore} max={100} />
                </td>
                <td className={`px-4 py-3 font-medium ${s.intrinsicValue.marginOfSafety > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {(s.intrinsicValue.marginOfSafety * 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3">
                  <Link href={`/stock/${s.ticker}`} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                    {t("detailLink")}
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-zinc-400">
                  {t("noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

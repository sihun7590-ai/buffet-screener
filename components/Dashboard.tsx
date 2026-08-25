"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { SCORE_AXES, type ScoreAxis, type StockScore } from "@/lib/types";
import { useFavorites } from "@/lib/supabase/useFavorites";
import ScoreBar, { scoreColor } from "./ScoreBar";
import FavoriteButton from "./FavoriteButton";
import InfoTip from "./InfoTip";

type SortKey = "ticker" | "sector" | "price" | "marketCap" | ScoreAxis | "totalScore" | "marginOfSafety";
type SortDir = "asc" | "desc";

const ALL_SECTORS = "";
const MIN_SCORE_STEPS = [0, 50, 60, 70, 80];
const PAGE_SIZE = 60;

const NUMERIC: Partial<Record<SortKey, (s: StockScore) => number>> = {
  price: (s) => s.price,
  marketCap: (s) => s.marketCap,
  totalScore: (s) => s.totalScore,
  marginOfSafety: (s) => s.intrinsicValue.marginOfSafety,
  ...Object.fromEntries(SCORE_AXES.map((axis) => [axis, (s: StockScore) => s.scores[axis]])),
};

const TEXT: Partial<Record<SortKey, (s: StockScore) => string>> = {
  ticker: (s) => s.ticker,
  sector: (s) => s.sector,
};

function compare(a: StockScore, b: StockScore, key: SortKey, dir: SortDir): number {
  const numeric = NUMERIC[key];
  if (numeric) {
    const av = numeric(a);
    const bv = numeric(b);
    // Tickers whose filings didn't yield a value sink to the bottom in both
    // directions — they're absent data, not a low score.
    const aOk = Number.isFinite(av);
    const bOk = Number.isFinite(bv);
    if (!aOk || !bOk) return aOk === bOk ? 0 : aOk ? -1 : 1;
    return dir === "desc" ? bv - av : av - bv;
  }
  const text = TEXT[key]!;
  const result = text(a).localeCompare(text(b));
  return dir === "desc" ? -result : result;
}

function formatMarketCap(v: number) {
  if (!Number.isFinite(v)) return "N/A";
  if (v >= 1_000_000_000_000) return `$${(v / 1_000_000_000_000).toFixed(2)}T`;
  return `$${(v / 1_000_000_000).toFixed(1)}B`;
}

function SortCaret({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-2.5 w-2.5 shrink-0 transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}
      aria-hidden="true"
    >
      <path
        d={active && dir === "asc" ? "M6 3.5 9.5 8h-7z" : "M6 8.5 2.5 4h7z"}
        fill={active ? "var(--brand)" : "currentColor"}
      />
    </svg>
  );
}

function StatTile({
  label,
  value,
  tip,
  tone,
}: {
  label: string;
  value: string;
  tip: string;
  tone?: "up" | "brand";
}) {
  const color = tone === "up" ? "var(--up)" : tone === "brand" ? "var(--brand)" : "var(--ink)";
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow)]">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        <span>{label}</span>
        <InfoTip text={tip} />
      </div>
      <div className="mt-1.5 font-mono text-xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export default function Dashboard({ scores }: { scores: StockScore[] }) {
  const t = useTranslations("dashboard");
  const tAxes = useTranslations("axes");
  const tGlossary = useTranslations("glossary");
  const tFavorite = useTranslations("favorite");
  const tSectors = useTranslations("sectors");
  const locale = useLocale();
  const router = useRouter();
  const { isSignedIn, favorites, toggle } = useFavorites();

  const [query, setQuery] = useState("");
  const [sector, setSector] = useState(ALL_SECTORS);
  const [minScore, setMinScore] = useState(0);
  const [buyOnly, setBuyOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("totalScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const priceFmt = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale],
  );

  const sectorLabel = (s: string) => (s === ALL_SECTORS ? t("filters.allSectors") : tSectors(s));
  const sectors = useMemo(
    () => [ALL_SECTORS, ...Array.from(new Set(scores.map((s) => s.sector))).sort()],
    [scores],
  );

  const stats = useMemo(() => {
    const finite = scores.filter((s) => Number.isFinite(s.totalScore));
    const avg = finite.length ? finite.reduce((sum, s) => sum + s.totalScore, 0) / finite.length : NaN;
    return {
      universe: scores.length,
      buyCandidates: scores.filter((s) => s.isBuyCandidate).length,
      avgScore: Number.isFinite(avg) ? avg.toFixed(1) : "N/A",
      undervalued: scores.filter((s) => s.intrinsicValue.marginOfSafety > 0).length,
    };
  }, [scores]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scores
      .filter((s) => sector === ALL_SECTORS || s.sector === sector)
      .filter((s) => s.totalScore >= minScore)
      .filter((s) => !buyOnly || s.isBuyCandidate)
      .filter((s) => !q || s.ticker.toLowerCase().includes(q) || s.companyName.toLowerCase().includes(q))
      .sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [scores, sector, minScore, buyOnly, query, sortKey, sortDir]);

  // A narrowed result set should start from the top again, not deep in a
  // "load more" run from the previous filter.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, sector, minScore, buyOnly]);

  const rows = filtered.slice(0, visible);
  const remaining = filtered.length - rows.length;
  const filtersActive = query !== "" || sector !== ALL_SECTORS || minScore !== 0 || buyOnly;

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(TEXT[key] ? "asc" : "desc");
    }
  };

  // The "?" sits beside the sort button rather than inside it — nesting a
  // button in a button is invalid, and clicking for help shouldn't re-sort.
  // It always trails the label, never the sort caret: on a right-aligned
  // column, reversing the whole row would strand it at the far edge of the
  // cell where it reads as belonging to nothing.
  const th = (key: SortKey, label: string, tip: string, align: "left" | "right" = "left") => (
    <th className={`px-3 py-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <span className="inline-flex h-9 items-center gap-1.5">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`group inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors hover:text-ink ${
            sortKey === key ? "text-ink" : "text-ink-faint"
          } ${align === "right" ? "flex-row-reverse" : ""}`}
        >
          <span>{label}</span>
          <SortCaret active={sortKey === key} dir={sortDir} />
        </button>
        <InfoTip text={tip} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("stats.universe")} value={String(stats.universe)} tip={tGlossary("universe")} />
        <StatTile
          label={t("stats.buyCandidates")}
          value={String(stats.buyCandidates)}
          tip={tGlossary("buyCandidate")}
          tone="up"
        />
        <StatTile label={t("stats.avgScore")} value={stats.avgScore} tip={tGlossary("avgScore")} />
        <StatTile
          label={t("stats.undervalued")}
          value={String(stats.undervalued)}
          tip={tGlossary("undervalued")}
          tone="brand"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 rounded-xl border border-line bg-surface p-3 shadow-[var(--shadow)]">
        <div className="relative min-w-[190px] flex-1 sm:max-w-xs">
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="8.8" cy="8.8" r="5.6" />
            <path strokeLinecap="round" d="m13 13 4 4" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-9 w-full rounded-md border border-line bg-subtle pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          aria-label={t("filters.sector")}
          className="h-9 cursor-pointer rounded-md border border-line bg-subtle px-2.5 text-[13px] text-ink-muted transition-colors hover:text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {sectorLabel(s)}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
            {t("filters.minScore")}
          </span>
          <div className="flex overflow-hidden rounded-md border border-line">
            {MIN_SCORE_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => setMinScore(step)}
                className={`h-9 border-l border-line px-2.5 font-mono text-xs font-semibold tabular-nums transition-colors first:border-l-0 ${
                  minScore === step
                    ? "bg-brand text-white"
                    : "bg-subtle text-ink-muted hover:bg-surface-hover hover:text-ink"
                }`}
              >
                {step === 0 ? t("filters.any") : `${step}+`}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setBuyOnly((v) => !v)}
          aria-pressed={buyOnly}
          className={`h-9 rounded-md border px-3 text-xs font-semibold transition-colors ${
            buyOnly
              ? "border-up bg-up/15 text-up"
              : "border-line bg-subtle text-ink-muted hover:text-ink"
          }`}
        >
          {t("filters.buyCandidateOnly")}
        </button>

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSector(ALL_SECTORS);
              setMinScore(0);
              setBuyOnly(false);
            }}
            className="h-9 px-1 text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {t("filters.reset")}
          </button>
        )}

        <span className="ml-auto font-mono text-xs tabular-nums text-ink-muted">
          {t("tickerCount", { count: filtered.length })}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow)]">
        {/* An overflow-x container is implicitly overflow-y too, so the grid
            gets its own scroll pane on desktop and the header sticks to the
            top of that pane rather than being pushed over the first row. */}
        <div className="overflow-auto lg:max-h-[calc(100vh-11rem)]">
          {/* whitespace-nowrap keeps the auto table layout from squeezing a
              column down to a character-per-line (Korean sector labels wrap
              anywhere otherwise); the company name is truncated instead. */}
          <table className="w-full min-w-[1080px] border-collapse whitespace-nowrap text-left">
            <thead className="sticky top-0 z-20 bg-subtle">
              <tr className="border-b border-line">
                <th className="w-9 px-3 py-0" />
                <th className="w-12 px-3 py-0 text-right text-[11px] font-semibold text-ink-faint">
                  {t("table.rank")}
                </th>
                {th("ticker", t("table.stock"), tGlossary("stock"))}
                {th("sector", t("table.sector"), tGlossary("sector"))}
                {th("price", t("table.price"), tGlossary("price"), "right")}
                {th("marketCap", t("table.marketCap"), tGlossary("marketCap"), "right")}
                {SCORE_AXES.map((axis) => (
                  <Fragment key={axis}>{th(axis, tAxes(`${axis}.name`), tAxes(`${axis}.tip`), "right")}</Fragment>
                ))}
                {th("totalScore", t("table.total"), tGlossary("total"))}
                {th("marginOfSafety", t("table.marginOfSafety"), tGlossary("marginOfSafety"), "right")}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const mos = s.intrinsicValue.marginOfSafety;
                const mosOk = Number.isFinite(mos);
                return (
                  <tr
                    key={s.ticker}
                    onClick={() => router.push(`/stock/${s.ticker}`)}
                    className="cursor-pointer border-b border-line/60 transition-colors last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="px-3 py-2.5">
                      <FavoriteButton
                        size="sm"
                        active={favorites.has(s.ticker)}
                        title={tFavorite(favorites.has(s.ticker) ? "remove" : "add")}
                        className="text-ink-faint hover:text-down"
                        onToggle={() => {
                          if (isSignedIn === false) {
                            router.push("/login");
                            return;
                          }
                          toggle(s.ticker, s.price);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-ink-faint">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-subtle font-mono text-[10px] font-bold text-ink-muted">
                          {s.ticker.slice(0, 2)}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <Link
                              href={`/stock/${s.ticker}`}
                              className="font-mono text-[13px] font-bold text-ink hover:text-brand"
                            >
                              {s.ticker}
                            </Link>
                            {s.isBuyCandidate && (
                              <span className="rounded bg-up/15 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-up">
                                Buy
                              </span>
                            )}
                          </span>
                          <span className="block max-w-[190px] truncate text-[11px] text-ink-faint">
                            {s.companyName}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-block rounded border border-line bg-subtle px-1.5 py-0.5 text-[11px] text-ink-muted">
                        {tSectors(s.sector)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink">
                      ${priceFmt.format(s.price)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[13px] tabular-nums text-ink-muted">
                      {formatMarketCap(s.marketCap)}
                    </td>
                    {SCORE_AXES.map((axis) => {
                      const v = s.scores[axis];
                      // Snapshots written before coverage existed report none;
                      // absent means the axis was scored on everything.
                      const covered = s.coverage?.[axis] ?? 1;
                      return (
                        <td
                          key={axis}
                          className="px-3 py-2.5 text-right font-mono text-[13px] font-semibold tabular-nums"
                          style={{ color: Number.isFinite(v) ? scoreColor(v, 100) : "var(--ink-faint)" }}
                        >
                          <span
                            className={covered < 1 ? "border-b border-dotted border-warn/70 pb-px" : undefined}
                            title={covered < 1 ? t("table.partialCoverage", { percent: Math.round(covered * 100) }) : undefined}
                          >
                            {Number.isFinite(v) ? v.toFixed(0) : "—"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5">
                      <ScoreBar score={s.totalScore} max={100} strong />
                    </td>
                    <td
                      className="px-3 py-2.5 text-right font-mono text-[13px] font-semibold tabular-nums"
                      style={{ color: mosOk ? (mos > 0 ? "var(--up)" : "var(--down)") : "var(--ink-faint)" }}
                    >
                      {mosOk ? `${mos > 0 ? "+" : ""}${(mos * 100).toFixed(1)}%` : "N/A"}
                    </td>
                    <td className="pr-3 text-right">
                      <svg
                        viewBox="0 0 20 20"
                        className="inline h-4 w-4 text-ink-faint"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8 5 5 5-5 5" />
                      </svg>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center text-sm text-ink-faint">
                    {t("noResults")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {remaining > 0 && (
          <div className="border-t border-line bg-subtle/50 p-3 text-center">
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="rounded-md border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {t("loadMore", { count: remaining })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

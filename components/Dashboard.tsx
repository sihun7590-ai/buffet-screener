"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { SCORE_AXES, type ScoreAxis, type StockScore } from "@/lib/types";
import { useFavorites } from "@/lib/supabase/useFavorites";
import {
  customIsBuyCandidate,
  customTotalScore,
  DEFAULT_SLIDER_WEIGHTS,
  isDefaultWeights,
  isValidSliderWeights,
  normalizeWeights,
  type SliderWeights,
} from "@/lib/customWeights";
import { evaluateStrategy, type Condition } from "@/lib/strategy";
import { scoreColor } from "./ScoreBar";
import ScoreGauge from "./ScoreGauge";
import FavoriteButton from "./FavoriteButton";
import InfoTip from "./InfoTip";
import StrategyBuilder from "./StrategyBuilder";

// Local to this browser only — the whole point is a quick "what if I weighted
// this differently" that costs nothing to try, not a preference tied to an
// account. Versioned so a future change to the axis set doesn't hand old
// clients a shape that no longer matches SCORE_AXES.
const WEIGHTS_STORAGE_KEY = "buffett-screener:weights:v1";

type SortKey = "ticker" | "sector" | "price" | "marketCap" | ScoreAxis | "totalScore" | "marginOfSafety";
type SortDir = "asc" | "desc";

const ALL_SECTORS = "";
const MIN_SCORE_STEPS = [0, 50, 60, 70, 80];
const PAGE_SIZE = 60;
const SORT_OPTIONS: SortKey[] = ["totalScore", "marginOfSafety", "price", "marketCap", "ticker", "sector"];

// totalScore is deliberately absent here — it depends on the current weight
// blend, which is component state, so compare() takes a totalOf callback for
// that one key instead of a static lookup.
const NUMERIC: Partial<Record<SortKey, (s: StockScore) => number>> = {
  price: (s) => s.price,
  marketCap: (s) => s.marketCap,
  marginOfSafety: (s) => s.intrinsicValue.marginOfSafety,
  ...Object.fromEntries(SCORE_AXES.map((axis) => [axis, (s: StockScore) => s.scores[axis]])),
};

const TEXT: Partial<Record<SortKey, (s: StockScore) => string>> = {
  ticker: (s) => s.ticker,
  sector: (s) => s.sector,
};

function compare(a: StockScore, b: StockScore, key: SortKey, dir: SortDir, totalOf: (s: StockScore) => number): number {
  const numeric = key === "totalScore" ? totalOf : NUMERIC[key];
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

// A cell any given ticker might be genuinely missing (SEC never tagged the
// figure) — CSV output should say so plainly rather than leave the column
// blank, which reads as a scraping bug rather than a known data gap.
function csvCell(v: number | string, formatter?: (v: number) => string): string {
  if (typeof v === "string") return `"${v.replace(/"/g, '""')}"`;
  if (!Number.isFinite(v)) return "N/A";
  return formatter ? formatter(v) : String(v);
}

function SortCaret({ dir }: { dir: SortDir }) {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0" aria-hidden="true">
      <path d={dir === "asc" ? "M6 3.5 9.5 8h-7z" : "M6 8.5 2.5 4h7z"} fill="var(--brand)" />
    </svg>
  );
}

export default function Dashboard({ scores }: { scores: StockScore[] }) {
  const t = useTranslations("dashboard");
  const tAxes = useTranslations("axes");
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

  const [sliders, setSliders] = useState<SliderWeights>(DEFAULT_SLIDER_WEIGHTS);
  const [weightsLoaded, setWeightsLoaded] = useState(false);
  const [weightsPanelOpen, setWeightsPanelOpen] = useState(false);

  // Conditions are not persisted the way the weight sliders are. A screen is
  // something you build, look at, and move on from; restoring one silently on
  // the next visit would leave someone staring at 11 results wondering where
  // the other 487 went. Saving one by name is explicit, and lives in the
  // builder itself.
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [strategyPanelOpen, setStrategyPanelOpen] = useState(false);

  // Read after mount, not in the initial state, so the first render matches
  // the server's (default weights) and only flips to a saved preference once
  // hydration is already settled. localStorage has no subscribe primitive
  // worth building here (this component is the only writer), so this stays a
  // plain mount effect rather than useSyncExternalStore.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WEIGHTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a browser-only store, not a value derivable during render
      if (isValidSliderWeights(parsed)) setSliders(parsed);
    } catch {
      // Corrupt or blocked storage — the default blend is a fine fallback.
    }
    setWeightsLoaded(true);
  }, []);

  useEffect(() => {
    // Guards against overwriting a saved preference with the default before
    // the load effect above has had a chance to run.
    if (!weightsLoaded) return;
    try {
      localStorage.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify(sliders));
    } catch {
      // Private browsing or a full quota — the session still works, it just
      // won't be remembered next time.
    }
  }, [sliders, weightsLoaded]);

  const isCustomWeights = useMemo(() => !isDefaultWeights(sliders), [sliders]);
  const weights = useMemo(() => normalizeWeights(sliders), [sliders]);

  // One pass over the universe per weight change rather than recomputing per
  // cell — 499 rows redone on every keystroke of search would otherwise still
  // be fine, but this keeps sort/filter/render all reading the same number.
  const effective = useMemo(() => {
    const map = new Map<string, { total: number; isBuyCandidate: boolean }>();
    for (const s of scores) {
      const total = isCustomWeights ? customTotalScore(s, weights) : s.totalScore;
      map.set(s.ticker, { total, isBuyCandidate: isCustomWeights ? customIsBuyCandidate(s, total) : s.isBuyCandidate });
    }
    return map;
  }, [scores, weights, isCustomWeights]);
  const effectiveTotal = useCallback((s: StockScore) => effective.get(s.ticker)?.total ?? s.totalScore, [effective]);
  const effectiveBuyCandidate = useCallback(
    (s: StockScore) => effective.get(s.ticker)?.isBuyCandidate ?? s.isBuyCandidate,
    [effective],
  );

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
    const totals = scores.map(effectiveTotal).filter(Number.isFinite);
    const avg = totals.length ? totals.reduce((sum, v) => sum + v, 0) / totals.length : NaN;
    return {
      universe: scores.length,
      buyCandidates: scores.filter(effectiveBuyCandidate).length,
      avgScore: avg,
      undervalued: scores.filter((s) => s.intrinsicValue.marginOfSafety > 0).length,
    };
  }, [scores, effectiveTotal, effectiveBuyCandidate]);

  // Highlighted separately from the filtered/sorted list below — these three
  // widgets always read the whole universe, independent of the filter bar,
  // so narrowing the list to one sector doesn't make the "today" picks vanish.
  const topBuyCandidate = useMemo(() => {
    const candidates = scores.filter(effectiveBuyCandidate);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, s) =>
      s.intrinsicValue.marginOfSafety > best.intrinsicValue.marginOfSafety ? s : best,
    );
  }, [scores, effectiveBuyCandidate]);

  const topMarginOfSafety = useMemo(
    () =>
      [...scores]
        .filter((s) => Number.isFinite(s.intrinsicValue.marginOfSafety))
        .sort((a, b) => b.intrinsicValue.marginOfSafety - a.intrinsicValue.marginOfSafety)
        .slice(0, 5),
    [scores],
  );
  const topMarginValue = topMarginOfSafety[0]?.intrinsicValue.marginOfSafety ?? 0;

  // Conditions run before the filter bar so the "N matched / M unmeasurable"
  // readout in the builder describes the whole universe against the screen,
  // not whatever the sector dropdown happens to be showing.
  const strategy = useMemo(
    () => evaluateStrategy(scores, conditions, effectiveTotal),
    [scores, conditions, effectiveTotal],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return strategy.matched
      .filter((s) => sector === ALL_SECTORS || s.sector === sector)
      .filter((s) => effectiveTotal(s) >= minScore)
      .filter((s) => !buyOnly || effectiveBuyCandidate(s))
      .filter((s) => !q || s.ticker.toLowerCase().includes(q) || s.companyName.toLowerCase().includes(q))
      .sort((a, b) => compare(a, b, sortKey, sortDir, effectiveTotal));
  }, [strategy, sector, minScore, buyOnly, query, sortKey, sortDir, effectiveTotal, effectiveBuyCandidate]);

  // A narrowed result set should start from the top again, not deep in a
  // "load more" run from the previous filter. Adjusted during render — React's
  // documented alternative to an effect for "reset state when a value changes"
  // — so there's no extra commit where `visible` still reflects the old filter.
  const filterSignature = `${query}|${sector}|${minScore}|${buyOnly}|${conditions.length}|${conditions
    .map((c) => `${c.metric}${c.op}${c.value}`)
    .join(",")}`;
  const [prevFilterSignature, setPrevFilterSignature] = useState(filterSignature);
  if (filterSignature !== prevFilterSignature) {
    setPrevFilterSignature(filterSignature);
    setVisible(PAGE_SIZE);
  }

  const rows = filtered.slice(0, visible);
  const remaining = filtered.length - rows.length;
  const filtersActive = query !== "" || sector !== ALL_SECTORS || minScore !== 0 || buyOnly || conditions.length > 0;

  const exportCsv = () => {
    const header = ["rank", "ticker", "company", "sector", "price", "marketCap", ...SCORE_AXES, "total", "marginOfSafety"];
    const lines = [header.join(",")];
    filtered.forEach((s, i) => {
      lines.push(
        [
          i + 1,
          s.ticker,
          csvCell(s.companyName),
          csvCell(tSectors(s.sector)),
          csvCell(s.price, (v) => v.toFixed(2)),
          csvCell(s.marketCap),
          ...SCORE_AXES.map((axis) => csvCell(s.scores[axis])),
          csvCell(effectiveTotal(s), (v) => v.toFixed(1)),
          csvCell(s.intrinsicValue.marginOfSafety, (v) => (v * 100).toFixed(1)),
        ].join(","),
      );
    });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `screener-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const goToStock = (ticker: string) => router.push(`/stock/${ticker}`);

  const favoriteToggle = (s: StockScore) => {
    if (isSignedIn === false) {
      router.push("/login");
      return;
    }
    toggle(s.ticker, s.price);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{t("title")}</h1>
          <p className="max-w-[620px] text-[13px] leading-relaxed text-ink-muted">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWeightsPanelOpen((v) => !v)}
            aria-pressed={weightsPanelOpen}
            className={`flex h-[38px] items-center gap-2 rounded-[11px] border px-3.5 text-xs font-semibold transition-colors ${
              weightsPanelOpen || isCustomWeights
                ? "border-brand-border bg-brand-soft text-brand-text-2"
                : "border-line-strong bg-surface-2 text-ink-2 hover:text-ink"
            }`}
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 6h12M6.5 10h7M9 14h2" />
            </svg>
            {t("weights.button")}
            {isCustomWeights && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => setStrategyPanelOpen((v) => !v)}
            aria-pressed={strategyPanelOpen}
            className={`flex h-[38px] items-center gap-2 rounded-[11px] border px-3.5 text-xs font-semibold transition-colors ${
              strategyPanelOpen || conditions.length > 0
                ? "border-brand-border bg-brand-soft text-brand-text-2"
                : "border-line-strong bg-surface-2 text-ink-2 hover:text-ink"
            }`}
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h14l-5.5 6.5V16L8.5 14v-3.5z" />
            </svg>
            {t("strategy.button")}
            {conditions.length > 0 && (
              <span className="font-mono tabular-nums text-brand-text">{conditions.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex h-[38px] items-center gap-2 rounded-[11px] bg-brand px-4 text-xs font-bold text-white shadow-[var(--shadow)] transition-opacity hover:opacity-90"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 13.5 8 9l3 2.5L16 6" />
            </svg>
            {t("csvExport")}
          </button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-ink-2">{t("widgets.avgScore")}</span>
            <InfoTip text={t("widgets.avgScoreTip")} />
          </div>
          <div className="flex justify-center py-1">
            <ScoreGauge score={stats.avgScore} max={100} size={140} />
          </div>
        </div>

        <div
          className="flex flex-col gap-3.5 rounded-[20px] border border-panel-border p-5"
          style={{ background: "var(--panel-grad)" }}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-[7px] bg-brand-soft text-brand-text">
                <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                  <path d="M10 2.6 11.9 7l4.6.5-3.4 3.2.9 4.7L10 13.2l-4 2.2.9-4.7L3.5 7.5 8.1 7z" />
                </svg>
              </span>
              {t("widgets.buyCandidateToday")}
              <InfoTip text={t("widgets.buyCandidateTip")} />
            </span>
            <span className="rounded-full bg-up/15 px-2.5 py-1 font-mono text-[10px] font-bold text-up">
              {t("tickerCount", { count: stats.buyCandidates })}
            </span>
          </div>
          {topBuyCandidate ? (
            <>
              <div className="flex flex-wrap items-end gap-3.5">
                <button type="button" onClick={() => goToStock(topBuyCandidate.ticker)} className="flex items-center gap-3 text-left">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] border border-panel-border bg-[#191428] font-mono text-[13px] font-bold text-brand-text-2">
                    {topBuyCandidate.ticker.slice(0, 2)}
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[19px] font-bold tracking-tight text-ink">{topBuyCandidate.ticker}</span>
                      <span className="rounded bg-up/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-up">
                        Buy
                      </span>
                    </span>
                    <span className="text-[12px] text-ink-muted">{topBuyCandidate.companyName}</span>
                  </span>
                </button>
                <div className="ml-auto flex flex-col items-end gap-1">
                  <span className="font-mono text-[22px] font-bold tabular-nums text-ink">${priceFmt.format(topBuyCandidate.price)}</span>
                  <span className="font-mono text-[12px] font-semibold text-up">
                    +{(topBuyCandidate.intrinsicValue.marginOfSafety * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(60px, 1fr))" }}>
                {SCORE_AXES.map((axis) => {
                  const v = topBuyCandidate.scores[axis];
                  const color = Number.isFinite(v) ? scoreColor(v, 100) : "var(--ink-faint)";
                  return (
                    <div key={axis} className="flex flex-col gap-1.5 rounded-xl bg-white/[0.03] px-2.5 py-2.5">
                      <span className="truncate text-[10px] font-semibold text-ink-muted">{tAxes(`${axis}.name`)}</span>
                      <span className="font-mono text-[15px] font-bold tabular-nums" style={{ color }}>
                        {Number.isFinite(v) ? v.toFixed(0) : "—"}
                      </span>
                      <span className="block h-1 w-full overflow-hidden rounded-full bg-border-2">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-[12px] text-ink-faint">{t("widgets.buyCandidateEmpty")}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-ink-2">{t("widgets.topMarginOfSafety")}</span>
            <InfoTip text={t("widgets.topMarginOfSafetyTip")} />
          </div>
          <div className="flex flex-col gap-0.5">
            {topMarginOfSafety.map((s, i) => (
              <button
                key={s.ticker}
                type="button"
                onClick={() => goToStock(s.ticker)}
                className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-surface-4"
              >
                <span className="w-3.5 font-mono text-[11px] font-semibold text-ink-6">{i + 1}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-[13px] font-bold text-ink">{s.ticker}</span>
                  <span className="max-w-[110px] truncate text-[10px] text-ink-4">{s.companyName}</span>
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="block h-[5px] w-11 overflow-hidden rounded-full bg-border-2">
                    <span
                      className="block h-full rounded-full bg-up"
                      style={{ width: `${Math.max(4, Math.min(100, (s.intrinsicValue.marginOfSafety / (topMarginValue || 1)) * 100))}%` }}
                    />
                  </span>
                  <span className="w-[52px] text-right font-mono text-[12px] font-bold tabular-nums text-up">
                    +{(s.intrinsicValue.marginOfSafety * 100).toFixed(1)}%
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-3 rounded-[18px] border border-line bg-surface p-3">
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
            className="h-9 w-full rounded-[10px] border border-line-strong bg-surface-3 pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          aria-label={t("filters.sector")}
          className="h-9 cursor-pointer rounded-[10px] border border-line-strong bg-surface-3 px-2.5 text-[13px] text-ink-2 transition-colors hover:text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {sectorLabel(s)}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-4">{t("filters.minScore")}</span>
          <div className="flex gap-1">
            {MIN_SCORE_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => setMinScore(step)}
                className={`h-9 rounded-[10px] border px-2.5 font-mono text-xs font-semibold tabular-nums transition-colors ${
                  minScore === step
                    ? "border-brand bg-brand text-white"
                    : "border-line-strong bg-surface-3 text-ink-muted hover:bg-surface-hover hover:text-ink"
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
          className={`flex h-9 items-center gap-2 rounded-[10px] border px-3 text-xs font-semibold transition-colors ${
            buyOnly ? "border-brand-border bg-brand-soft text-brand-text-2" : "border-line-strong bg-surface-3 text-ink-muted hover:text-ink"
          }`}
        >
          <span
            className="grid h-3.5 w-3.5 place-items-center rounded"
            style={{ border: `1px solid ${buyOnly ? "var(--brand-text-2)" : "var(--ink-muted)"}`, background: buyOnly ? "var(--brand)" : "transparent" }}
          />
          {t("filters.buyCandidateOnly")}
        </button>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-4">{t("sort.label")}</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 cursor-pointer rounded-[10px] border border-line-strong bg-surface-3 px-2.5 text-[13px] text-ink-2 transition-colors hover:text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {SORT_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {t(`sort.${key}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            aria-label={t("sort.label")}
            className="grid h-9 w-9 place-items-center rounded-[10px] border border-line-strong bg-surface-3 text-ink-muted transition-colors hover:text-ink"
          >
            <SortCaret dir={sortDir} />
          </button>
        </div>

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSector(ALL_SECTORS);
              setMinScore(0);
              setBuyOnly(false);
              setConditions([]);
            }}
            className="h-9 px-1 text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            {t("filters.reset")}
          </button>
        )}

        <span className="ml-auto font-mono text-xs tabular-nums text-ink-muted">{t("tickerCount", { count: filtered.length })}</span>
      </div>

      {weightsPanelOpen && (
        <div className="rounded-[18px] border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              {t("weights.title")}
              <InfoTip text={t("weights.tip")} />
            </h3>
            {isCustomWeights && (
              <button
                type="button"
                onClick={() => setSliders(DEFAULT_SLIDER_WEIGHTS)}
                className="text-xs font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                {t("weights.reset")}
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {SCORE_AXES.map((axis) => (
              <div key={axis} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-[11px] font-semibold text-ink-muted">
                  <span>{tAxes(`${axis}.name`)}</span>
                  <span className="font-mono tabular-nums text-ink">{Math.round(weights[axis] * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sliders[axis]}
                  onChange={(e) => setSliders((prev) => ({ ...prev, [axis]: Number(e.target.value) }))}
                  aria-label={tAxes(`${axis}.name`)}
                  className="w-full accent-brand"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {(strategyPanelOpen || conditions.length > 0) && (
        <StrategyBuilder
          conditions={conditions}
          onChange={setConditions}
          matchCount={strategy.matched.length}
          missingData={strategy.missingData}
        />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-[18px] border border-line bg-surface p-16 text-center text-sm text-ink-faint">{t("noResults")}</div>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(272px, 1fr))" }}>
          {rows.map((s, i) => {
            const mos = s.intrinsicValue.marginOfSafety;
            const mosOk = Number.isFinite(mos);
            const total = effectiveTotal(s);
            const isBuyCandidate = effectiveBuyCandidate(s);
            const totalColor = scoreColor(total, 100);
            return (
              <div
                key={s.ticker}
                role="link"
                tabIndex={0}
                onClick={() => goToStock(s.ticker)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") goToStock(s.ticker);
                }}
                className="flex cursor-pointer flex-col gap-3.5 rounded-[18px] border border-line bg-surface p-[18px] transition-colors hover:border-brand-border hover:bg-surface-hover"
              >
                <div className="flex items-start gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-border-3 bg-surface-4 font-mono text-[11px] font-bold text-ink-muted">
                    {s.ticker.slice(0, 2)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-[15px] font-bold text-ink">{s.ticker}</span>
                      {isBuyCandidate && (
                        <span className="rounded bg-up/15 px-1 py-px text-[9px] font-extrabold uppercase tracking-wide text-up">Buy</span>
                      )}
                    </span>
                    <span className="block max-w-[150px] truncate text-[11px] text-ink-4">{s.companyName}</span>
                  </span>
                  <FavoriteButton
                    size="sm"
                    active={favorites.has(s.ticker)}
                    title={tFavorite(favorites.has(s.ticker) ? "remove" : "add")}
                    className="ml-auto text-ink-faint hover:text-brand"
                    onToggle={() => favoriteToggle(s)}
                  />
                  <span className="font-mono text-[11px] font-semibold text-ink-6">#{i + 1}</span>
                </div>

                <div className="flex items-end justify-between">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-semibold text-ink-4">{t("table.price")}</span>
                    <span className="font-mono text-[18px] font-bold tabular-nums text-ink">${priceFmt.format(s.price)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-semibold text-ink-4">{t("table.marginOfSafety")}</span>
                    <span
                      className="font-mono text-[15px] font-bold tabular-nums"
                      style={{ color: mosOk ? (mos > 0 ? "var(--up)" : "var(--down)") : "var(--ink-faint)" }}
                    >
                      {mosOk ? `${mos > 0 ? "+" : ""}${(mos * 100).toFixed(1)}%` : "N/A"}
                    </span>
                  </span>
                </div>

                <div className="flex items-center gap-2.5 border-t border-divider pt-3">
                  <span className="font-mono text-[22px] font-bold tracking-tight tabular-nums" style={{ color: totalColor }}>
                    {total.toFixed(1)}
                  </span>
                  <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-border-2">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, total))}%`, background: totalColor }} />
                  </span>
                  <span className="rounded-[6px] border border-border-3 bg-surface-4 px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                    {tSectors(s.sector)}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {SCORE_AXES.map((axis) => {
                    const v = s.scores[axis];
                    const covered = s.coverage?.[axis] ?? 1;
                    const color = Number.isFinite(v) ? scoreColor(v, 100) : "var(--ink-faint)";
                    return (
                      <span key={axis} className="flex flex-col items-center gap-1">
                        <span
                          className={`font-mono text-[11px] font-bold tabular-nums ${covered < 1 ? "border-b border-dotted border-warn/70" : ""}`}
                          style={{ color }}
                          title={covered < 1 ? t("table.partialCoverage", { percent: Math.round(covered * 100) }) : undefined}
                        >
                          {Number.isFinite(v) ? v.toFixed(0) : "—"}
                        </span>
                        <span className="block h-[3px] w-full overflow-hidden rounded-full bg-border-2">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
                        </span>
                        <span className="text-[9px] text-ink-faint">{tAxes(`${axis}.short`)}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {remaining > 0 && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="rounded-xl border border-border-3 bg-surface-3 px-[22px] py-[11px] text-xs font-bold text-ink-2 transition-colors hover:text-ink"
          >
            {t("loadMore", { count: remaining })}
          </button>
        </div>
      )}
    </div>
  );
}

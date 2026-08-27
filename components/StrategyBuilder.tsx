"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  METRIC_BY_ID,
  PRESETS,
  STRATEGY_METRICS,
  isValidSavedStrategies,
  type Condition,
  type Operator,
  type SavedStrategy,
} from "@/lib/strategy";
import InfoTip from "./InfoTip";

// Same reasoning as the weight sliders' storage: a screen someone is trying out
// belongs to this browser, not to an account, and versioning the key means a
// later change to the metric set can't hand an old client a shape it can't read.
const STORAGE_KEY = "buffett-screener:strategies:v1";

// Conditions are keyed rather than indexed so editing one doesn't make React
// reuse a sibling's input state when a row above it is deleted.
let keyCounter = 0;
const nextKey = () => `c${++keyCounter}`;

export function withKeys(conditions: Omit<Condition, "key">[]): Condition[] {
  return conditions.map((c) => ({ ...c, key: nextKey() }));
}

export default function StrategyBuilder({
  conditions,
  onChange,
  matchCount,
  missingData,
}: {
  conditions: Condition[];
  onChange: (next: Condition[]) => void;
  matchCount: number;
  missingData: number;
}) {
  const t = useTranslations("dashboard.strategy");
  const tMetric = useTranslations("dashboard.strategy.metric");

  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a browser-only store, not derivable during render
      if (isValidSavedStrategies(parsed)) setSaved(parsed);
    } catch {
      // Corrupt or blocked storage — an empty list is a fine fallback.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Private browsing or a full quota — this session still works.
    }
  }, [saved, loaded]);

  const addCondition = () => {
    // Offer a metric that isn't already in the list, so "add" doesn't produce a
    // duplicate row that silently does nothing.
    const used = new Set(conditions.map((c) => c.metric));
    const metric = STRATEGY_METRICS.find((m) => !used.has(m.id)) ?? STRATEGY_METRICS[0];
    onChange([...conditions, { key: nextKey(), metric: metric.id, op: metric.defaultOp, value: metric.defaultValue }]);
  };

  const update = (key: string, patch: Partial<Condition>) =>
    onChange(conditions.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const remove = (key: string) => onChange(conditions.filter((c) => c.key !== key));

  const changeMetric = (key: string, metricId: string) => {
    const m = METRIC_BY_ID.get(metricId);
    if (!m) return;
    // Carrying the old number across units would produce "P/E ≥ 15%" reading as
    // a market cap of 15 billion. Switching metric resets to that metric's own
    // sensible starting point.
    update(key, { metric: metricId, op: m.defaultOp, value: m.defaultValue });
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || conditions.length === 0) return;
    setSaved((prev) => [...prev.filter((s) => s.name !== trimmed), { name: trimmed, conditions }]);
    setName("");
  };

  const unitSuffix = (metricId: string) => {
    const m = METRIC_BY_ID.get(metricId);
    if (!m) return "";
    return t(`unit.${m.unit}`);
  };

  return (
    <div className="rounded-[18px] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
          {t("title")}
          <InfoTip text={t("tip")} />
        </h3>
        {conditions.length > 0 && (
          <span className="font-mono text-[12px] tabular-nums text-ink-muted">
            {t("matchCount", { count: matchCount })}
            {missingData > 0 && (
              <span className="ml-2 text-warn">
                {t("missingData", { count: missingData })}
                <InfoTip text={t("missingDataTip")} className="ml-1 border-warn/50 text-warn" />
              </span>
            )}
          </span>
        )}
      </div>

      {/* Presets are conditions, not modes — loading one fills the rows below
          and every line stays editable. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-ink-faint">{t("presetsLabel")}</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(withKeys(p.conditions))}
            className="rounded-[9px] border border-line-strong bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            {t(`preset.${p.id}`)}
          </button>
        ))}
      </div>

      {conditions.length === 0 ? (
        <p className="mt-3.5 text-[12px] leading-relaxed text-ink-faint">{t("empty")}</p>
      ) : (
        <ul className="mt-3.5 flex flex-col gap-2">
          {conditions.map((c, i) => (
            <li key={c.key} className="flex flex-wrap items-center gap-2">
              <span className="w-8 shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-faint">
                {i === 0 ? t("where") : t("and")}
              </span>
              <select
                value={c.metric}
                onChange={(e) => changeMetric(c.key, e.target.value)}
                aria-label={t("metricLabel")}
                className="h-9 min-w-[150px] flex-1 rounded-[10px] border border-line-strong bg-surface-3 px-2.5 text-[12px] text-ink"
              >
                {STRATEGY_METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {tMetric(m.id)}
                  </option>
                ))}
              </select>
              <select
                value={c.op}
                onChange={(e) => update(c.key, { op: e.target.value as Operator })}
                aria-label={t("operatorLabel")}
                className="h-9 w-[62px] shrink-0 rounded-[10px] border border-line-strong bg-surface-3 px-2 text-center font-mono text-[13px] text-ink"
              >
                <option value="gte">≥</option>
                <option value="lte">≤</option>
              </select>
              <span className="flex h-9 shrink-0 items-center rounded-[10px] border border-line-strong bg-surface-3 pr-2.5">
                <input
                  type="number"
                  value={Number.isFinite(c.value) ? c.value : ""}
                  onChange={(e) => update(c.key, { value: Number(e.target.value) })}
                  aria-label={t("valueLabel")}
                  step="any"
                  className="h-full w-[76px] bg-transparent px-2.5 text-right font-mono text-[13px] tabular-nums text-ink outline-none"
                />
                <span className="font-mono text-[11px] text-ink-faint">{unitSuffix(c.metric)}</span>
              </span>
              <button
                type="button"
                onClick={() => remove(c.key)}
                aria-label={t("removeCondition")}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-line-strong bg-surface-3 text-ink-faint transition-colors hover:text-down"
              >
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addCondition}
          disabled={conditions.length >= STRATEGY_METRICS.length}
          className="h-9 rounded-[10px] border border-brand-border bg-brand-soft px-3 text-[12px] font-semibold text-brand-text-2 transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {t("addCondition")}
        </button>
        {conditions.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => onChange([])}
              className="h-9 px-1 text-[12px] font-medium text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
            >
              {t("clear")}
            </button>
            <span className="ml-auto flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                placeholder={t("namePlaceholder")}
                aria-label={t("namePlaceholder")}
                maxLength={40}
                className="h-9 w-[168px] rounded-[10px] border border-line-strong bg-surface-3 px-2.5 text-[12px] text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                type="button"
                onClick={save}
                disabled={name.trim() === ""}
                className="h-9 rounded-[10px] border border-line-strong bg-surface-2 px-3 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-40"
              >
                {t("save")}
              </button>
            </span>
          </>
        )}
      </div>

      {saved.length > 0 && (
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
          <span className="text-[11px] font-semibold text-ink-faint">{t("savedLabel")}</span>
          {saved.map((s) => (
            <span
              key={s.name}
              className="flex items-center gap-1 rounded-[9px] border border-line-strong bg-surface-2 pl-2.5 text-[11px] font-semibold text-ink-2"
            >
              <button type="button" onClick={() => onChange(withKeys(s.conditions))} className="py-1 hover:text-ink">
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => setSaved((prev) => prev.filter((x) => x.name !== s.name))}
                aria-label={t("deleteSaved", { name: s.name })}
                className="px-1.5 py-1 text-ink-faint transition-colors hover:text-down"
              >
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

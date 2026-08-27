"use client";

import { useTranslations } from "next-intl";
import { METRIC_BY_ID, STRATEGY_METRICS, type Operator } from "@/lib/strategy";

// The metric / comparison / threshold triple, shared by the screen builder and
// the thesis-breaker rules. They are the same question asked in opposite
// directions — "which companies satisfy this" and "has this become true of what
// I hold" — so the controls, the units and the defaults have to match, or a
// rule copied from one to the other would quietly mean something else.
export default function ConditionControls({
  metric,
  op,
  value,
  onMetricChange,
  onOpChange,
  onValueChange,
}: {
  metric: string;
  op: Operator;
  value: number;
  onMetricChange: (metric: string) => void;
  onOpChange: (op: Operator) => void;
  onValueChange: (value: number) => void;
}) {
  const t = useTranslations("dashboard.strategy");
  const tMetric = useTranslations("dashboard.strategy.metric");

  const unit = METRIC_BY_ID.get(metric)?.unit;

  return (
    <>
      <select
        value={metric}
        onChange={(e) => onMetricChange(e.target.value)}
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
        value={op}
        onChange={(e) => onOpChange(e.target.value as Operator)}
        aria-label={t("operatorLabel")}
        className="h-9 w-[62px] shrink-0 rounded-[10px] border border-line-strong bg-surface-3 px-2 text-center font-mono text-[13px] text-ink"
      >
        <option value="gte">≥</option>
        <option value="lte">≤</option>
      </select>
      <span className="flex h-9 shrink-0 items-center rounded-[10px] border border-line-strong bg-surface-3 pr-2.5">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onValueChange(Number(e.target.value))}
          aria-label={t("valueLabel")}
          step="any"
          className="h-full w-[76px] bg-transparent px-2.5 text-right font-mono text-[13px] tabular-nums text-ink outline-none"
        />
        <span className="font-mono text-[11px] text-ink-faint">{unit ? t(`unit.${unit}`) : ""}</span>
      </span>
    </>
  );
}

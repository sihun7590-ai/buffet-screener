"use client";

import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { StrategyId, StrategyResult } from "@/lib/backtest";

// Same hand-rolled-SVG approach as ScoreHistoryChart.tsx (this project
// deliberately carries no charting library): onMouseMove on the whole SVG
// rather than per-point handlers, a PAD/viewBox layout, and colors picked
// off the semantic --up/--down tokens so four overlapping lines don't
// accidentally read as "this one is good, that one is bad" — an equity curve
// going down is not the same kind of "bad" as a red score.
const SERIES_COLOR: Record<StrategyId, string> = {
  buyCandidate: "var(--brand)",
  top20: "#d97706",
  universe: "#3b82f6",
  spy: "#12a594",
};

const W = 760;
const H = 280;
const PAD = { top: 14, right: 14, bottom: 26, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export default function BacktestChart({
  strategies,
  quarterDates,
}: {
  strategies: StrategyResult[];
  quarterDates: string[];
}) {
  const t = useTranslations("backtest");
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState<Set<StrategyId>>(new Set(strategies.map((s) => s.id)));
  const [hover, setHover] = useState<number | null>(null);

  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { year: "2-digit", month: "short" }), [locale]);
  const points = quarterDates.length;

  const visibleStrategies = strategies.filter((s) => visible.has(s.id));
  const allValues = visibleStrategies.flatMap((s) => s.equityCurve.map((p) => p.value));
  const minV = allValues.length ? Math.min(...allValues) : 90;
  const maxV = allValues.length ? Math.max(...allValues) : 110;
  const range = Math.max(1, maxV - minV);
  const yMin = minV - range * 0.08;
  const yMax = maxV + range * 0.08;

  const x = (i: number) => PAD.left + (points <= 1 ? PLOT_W / 2 : (i / (points - 1)) * PLOT_W);
  const y = (v: number) => PAD.top + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H;

  const path = (curve: { value: number }[]) =>
    curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const toggle = (id: StrategyId) =>
    setVisible((prev) => {
      const next = new Set(prev);
      // Never let the chart empty out entirely.
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      return next;
    });

  // Reading the pointer's x against the whole plot, rather than giving each
  // point its own hit area, means there's no gap between quarters to fall
  // into and the readout tracks the cursor continuously.
  const trackPointer = (e: ReactMouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const viewBoxX = ((e.clientX - box.left) / box.width) * W;
    const ratio = (viewBoxX - PAD.left) / PLOT_W;
    const index = Math.round(ratio * (points - 1));
    setHover(Math.max(0, Math.min(points - 1, index)));
  };

  const active = hover ?? points - 1;
  const activeDate = quarterDates[active];

  const gridValues = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => yMin + (i / n) * (yMax - yMin));
  }, [yMin, yMax]);

  const label = (id: StrategyId) => t(`series.${id}`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {strategies.map((s) => {
          const on = visible.has(s.id);
          const activeVal = s.equityCurve[active]?.value;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-colors ${
                on ? "border-line-strong text-ink" : "border-line text-ink-faint hover:text-ink-muted"
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: on ? SERIES_COLOR[s.id] : "var(--line-strong)" }}
              />
              {label(s.id)}
              {activeVal != null && (
                <span className="font-mono tabular-nums" style={{ color: on ? SERIES_COLOR[s.id] : undefined }}>
                  {activeVal.toFixed(0)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[280px] w-full min-w-[560px]"
          role="img"
          aria-label={t("chartTitle")}
          onMouseMove={trackPointer}
          onMouseLeave={() => setHover(null)}
        >
          {gridValues.map((v, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="var(--ink-faint)">
                {v.toFixed(0)}
              </text>
            </g>
          ))}

          {quarterDates.map((d, i) =>
            i % Math.max(1, Math.ceil(points / 7)) === 0 ? (
              <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--ink-faint)">
                {dateFmt.format(new Date(`${d}T00:00:00Z`))}
              </text>
            ) : null,
          )}

          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--line-strong)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}

          {visibleStrategies.map((s) => (
            <path
              key={s.id}
              d={path(s.equityCurve)}
              fill="none"
              stroke={SERIES_COLOR[s.id]}
              strokeWidth={s.id === "spy" ? 2.2 : 1.8}
              strokeDasharray={s.id === "spy" ? "5 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {visibleStrategies.map((s) =>
            s.equityCurve[active] ? (
              <circle key={s.id} cx={x(active)} cy={y(s.equityCurve[active].value)} r="3" fill={SERIES_COLOR[s.id]} />
            ) : null,
          )}

          {/* A transparent backdrop so the pointer is over the SVG anywhere in
              the plot, not only when it happens to be on a ~2px line. */}
          <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="transparent" />
        </svg>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[11px] text-ink-faint">
        <span className="font-mono tabular-nums">{activeDate}</span>
        <span>{t("chartHint")}</span>
      </div>
    </div>
  );
}

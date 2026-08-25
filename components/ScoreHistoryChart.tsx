"use client";

import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SCORE_AXES, type ScoreAxis } from "@/lib/types";

export interface ScoreHistoryPoint {
  asOf: string; // YYYY-MM-DD
  total: number;
  quality: number;
  growth: number;
  health: number;
  consistency: number;
  valuation: number;
  price: number | null;
  isBackfilled: boolean;
  // Read only by the watchlist's change detection; the chart plots the six
  // series above. Optional so a caller that doesn't need them can select less.
  marginOfSafety?: number | null;
  isBuyCandidate?: boolean;
  scoringVersion?: number;
}

type Series = "total" | ScoreAxis;
const SERIES: Series[] = ["total", ...SCORE_AXES];

// Distinct enough to tell six lines apart, and legible on both the light and
// dark canvas — which rules out the palette's own semantic colors for most of
// them, since --up/--down carry "good/bad" meaning that would misread here.
const SERIES_COLOR: Record<Series, string> = {
  total: "var(--brand)",
  quality: "#12a594",
  growth: "#d97706",
  health: "#3b82f6",
  consistency: "#9333ea",
  valuation: "#e0567a",
};

const W = 760;
const H = 260;
const PAD = { top: 14, right: 14, bottom: 26, left: 30 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export default function ScoreHistoryChart({ points }: { points: ScoreHistoryPoint[] }) {
  const t = useTranslations("history");
  const tAxes = useTranslations("axes");
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const [visible, setVisible] = useState<Set<Series>>(new Set<Series>(["total", "quality", "valuation"]));
  const [hover, setHover] = useState<number | null>(null);

  const label = (s: Series) => (s === "total" ? t("total") : tAxes(`${s}.name`));

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "2-digit", month: "short" }),
    [locale],
  );

  // Evenly spaced by index rather than by elapsed time: the points are
  // quarter-ends, so the spacing is already regular, and this keeps the
  // leftmost and rightmost points on the axis instead of inset.
  const x = (i: number) => PAD.left + (points.length === 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W);
  const y = (v: number) => PAD.top + PLOT_H - (Math.max(0, Math.min(100, v)) / 100) * PLOT_H;

  const path = (key: Series) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const toggle = (s: Series) =>
    setVisible((prev) => {
      const next = new Set(prev);
      // Never let the chart empty out entirely.
      if (next.has(s) && next.size > 1) next.delete(s);
      else next.add(s);
      return next;
    });

  // Reading the pointer's x against the whole plot, rather than giving each
  // point its own hit area, means there's no gap between quarters to fall into
  // and the readout tracks the cursor continuously.
  const trackPointer = (e: ReactMouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const viewBoxX = ((e.clientX - box.left) / box.width) * W;
    const ratio = (viewBoxX - PAD.left) / PLOT_W;
    const index = Math.round(ratio * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, index)));
  };

  const active = hover ?? points.length - 1;
  const activePoint = points[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {SERIES.map((s) => {
          const on = visible.has(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={on}
              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-colors ${
                on ? "border-line-strong text-ink" : "border-line text-ink-faint hover:text-ink-muted"
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: on ? SERIES_COLOR[s] : "var(--line-strong)" }}
              />
              {label(s)}
              <span className="font-mono tabular-nums" style={{ color: on ? SERIES_COLOR[s] : undefined }}>
                {activePoint[s].toFixed(0)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[260px] w-full min-w-[560px]"
          role="img"
          aria-label={t("title")}
          onMouseMove={trackPointer}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="var(--ink-faint)">
                {v}
              </text>
            </g>
          ))}

          {points.map((p, i) =>
            i % Math.max(1, Math.ceil(points.length / 7)) === 0 ? (
              <text key={p.asOf} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--ink-faint)">
                {dateFmt.format(new Date(`${p.asOf}T00:00:00Z`))}
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

          {SERIES.filter((s) => visible.has(s)).map((s) => (
            <path
              key={s}
              d={path(s)}
              fill="none"
              stroke={SERIES_COLOR[s]}
              strokeWidth={s === "total" ? 2.4 : 1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {SERIES.filter((s) => visible.has(s)).map((s) => (
            <circle key={s} cx={x(active)} cy={y(points[active][s])} r="3" fill={SERIES_COLOR[s]} />
          ))}

          {/* A transparent backdrop so the pointer is over the SVG anywhere in
              the plot, not only when it happens to be on a 1.6px line. */}
          <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="transparent" />
        </svg>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[11px] text-ink-faint">
        <span className="font-mono tabular-nums">
          {activePoint.asOf}
          {activePoint.price != null && ` · $${activePoint.price.toFixed(2)}`}
        </span>
        {points.some((p) => p.isBackfilled) && <span>{t("backfillNote")}</span>}
      </div>
    </div>
  );
}

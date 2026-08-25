"use client";

import { useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DcaResult } from "@/lib/dca";

// Same hand-rolled-SVG approach as BacktestChart.tsx / ScoreHistoryChart.tsx
// (this project carries no charting library). Two fixed series instead of a
// togglable set: what was put in, and what it's worth now.
const W = 760;
const H = 220;
const PAD = { top: 14, right: 14, bottom: 26, left: 48 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

export default function DcaChart({ curve }: { curve: DcaResult["equityCurve"] }) {
  const t = useTranslations("dca");
  const locale = useLocale();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const currencyFmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
    [locale],
  );
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { year: "2-digit", month: "short" }), [locale]);
  const points = curve.length;

  const allValues = curve.flatMap((p) => [p.invested, p.value]);
  const minV = allValues.length ? Math.min(0, ...allValues) : 0;
  const maxV = allValues.length ? Math.max(...allValues) : 1;
  const range = Math.max(1, maxV - minV);
  const yMin = minV - range * 0.05;
  const yMax = maxV + range * 0.08;

  const x = (i: number) => PAD.left + (points <= 1 ? PLOT_W / 2 : (i / (points - 1)) * PLOT_W);
  const y = (v: number) => PAD.top + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H;

  const path = (key: "invested" | "value") =>
    curve.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");

  const trackPointer = (e: ReactMouseEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || points === 0) return;
    const viewBoxX = ((e.clientX - box.left) / box.width) * W;
    const ratio = (viewBoxX - PAD.left) / PLOT_W;
    const index = Math.round(ratio * (points - 1));
    setHover(Math.max(0, Math.min(points - 1, index)));
  };

  const active = hover ?? points - 1;
  const activePoint = curve[active];

  const gridValues = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => yMin + (i / n) * (yMax - yMin));
  }, [yMin, yMax]);

  if (points === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 text-[11px] font-semibold">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--ink-faint)" }} />
          {t("chart.invested")}
        </span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--brand)" }}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
          {t("chart.value")}
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[220px] w-full min-w-[480px]"
          role="img"
          aria-label={t("chart.title")}
          onMouseMove={trackPointer}
          onMouseLeave={() => setHover(null)}
        >
          {gridValues.map((v, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="var(--ink-faint)">
                {currencyFmt.format(v)}
              </text>
            </g>
          ))}

          {curve.map((p, i) =>
            i % Math.max(1, Math.ceil(points / 6)) === 0 ? (
              <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--ink-faint)">
                {dateFmt.format(new Date(`${p.date}T00:00:00Z`))}
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

          <path d={path("invested")} fill="none" stroke="var(--ink-faint)" strokeWidth="1.8" strokeDasharray="5 3" />
          <path d={path("value")} fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />

          {activePoint && (
            <>
              <circle cx={x(active)} cy={y(activePoint.invested)} r="3" fill="var(--ink-faint)" />
              <circle cx={x(active)} cy={y(activePoint.value)} r="3" fill="var(--brand)" />
            </>
          )}

          <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="transparent" />
        </svg>
      </div>

      {activePoint && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[11px] text-ink-faint">
          <span className="font-mono tabular-nums">{activePoint.date}</span>
          <span className="flex gap-3 font-mono tabular-nums">
            <span>{t("chart.invested")} {currencyFmt.format(activePoint.invested)}</span>
            <span style={{ color: "var(--brand)" }}>{t("chart.value")} {currencyFmt.format(activePoint.value)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

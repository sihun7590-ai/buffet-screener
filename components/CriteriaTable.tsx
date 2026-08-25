import { getLocale, getTranslations } from "next-intl/server";
import type { CriterionResult } from "@/lib/types";
import { formatCriterionValue } from "@/lib/criteriaText";
import Panel from "./Panel";
import InfoTip from "./InfoTip";
import { scoreColor } from "./ScoreBar";

// Three states, not two. A criterion we couldn't measure gets a neutral dash
// rather than the same red cross as one the company genuinely failed — the
// distinction is the whole point of tracking availability.
function StatusDot({ passed, measured }: { passed: boolean; measured: boolean }) {
  const color = !measured ? "var(--ink-faint)" : passed ? "var(--up)" : "var(--down)";
  const path = !measured ? "M3 6h6" : passed ? "m2.5 6.2 2.4 2.4 4.6-5" : "M3.2 3.2l5.6 5.6M8.8 3.2 3.2 8.8";
  return (
    <span
      className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full"
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke={color} strokeWidth="2.2">
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </span>
  );
}

export default async function CriteriaTable({
  title,
  titleTip,
  criteria,
}: {
  title: string;
  titleTip?: string;
  criteria: CriterionResult[];
}) {
  const locale = await getLocale();
  const t = await getTranslations("criteria");
  const tTable = await getTranslations("stock.criteriaTable");
  const tCommon = await getTranslations("common");
  const tSource = await getTranslations("dataSource");

  // The panel total counts only what was measurable, so it matches the axis
  // score above it. Showing points out of a denominator that includes criteria
  // we skipped would make every partially-readable company look like it failed
  // the ones we couldn't read.
  const measured = criteria.filter((c) => c.available !== false);
  const missing = criteria.length - measured.length;
  const total = measured.reduce((sum, c) => sum + c.points, 0);
  const max = measured.reduce((sum, c) => sum + c.maxPoints, 0);

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {title}
          {titleTip && <InfoTip text={titleTip} />}
        </span>
      }
      padded={false}
      trailing={
        <span className="flex items-center gap-2">
          {missing > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-ink-faint">
              {tSource("measuredOf", { count: missing })}
              <InfoTip text={tSource("coverageTip")} />
            </span>
          )}
          <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: scoreColor(total, max) }}>
            {Number.isFinite(total) ? total.toFixed(1) : tCommon("notAvailable")}
            <span className="font-normal text-ink-faint"> / {max}</span>
          </span>
        </span>
      }
    >
      <ul className="divide-y divide-line">
        {criteria.map((c) => {
          const isMeasured = c.available !== false;
          const pct = isMeasured && Number.isFinite(c.points)
            ? Math.max(0, Math.min(1, c.points / c.maxPoints)) * 100
            : 0;
          return (
            <li key={c.id} className={`flex gap-3 px-4 py-3.5${isMeasured ? "" : " bg-subtle/50"}`}>
              <StatusDot passed={c.passed} measured={isMeasured} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`text-[13px] font-semibold ${isMeasured ? "text-ink" : "text-ink-muted"}`}>
                    {t(`${c.id}.label`)}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-muted">
                    {!isMeasured ? (
                      <span className="font-sans text-ink-faint">{tSource("unavailable")}</span>
                    ) : (
                      <>
                        {Number.isFinite(c.points) ? c.points.toFixed(1) : tCommon("notAvailable")}
                        <span className="text-ink-faint"> / {c.maxPoints}</span>
                      </>
                    )}
                  </span>
                </div>

                {isMeasured && (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: c.passed ? "var(--up)" : "var(--warn)" }}
                    />
                  </div>
                )}

                {isMeasured && (
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                    <span>
                      <span className="text-ink-faint">{tTable("actualValue")} </span>
                      <span className="font-mono tabular-nums text-ink">
                        {formatCriterionValue(c, locale, (key) => tCommon(key))}
                      </span>
                    </span>
                    <span>
                      <span className="text-ink-faint">{tTable("threshold")} </span>
                      <span className="font-mono tabular-nums text-ink-muted">{t(`${c.id}.threshold`)}</span>
                    </span>
                  </div>
                )}

                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                  {isMeasured ? t(`${c.id}.explanation`) : tSource("unavailableReason")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

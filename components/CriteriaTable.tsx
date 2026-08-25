import { getLocale, getTranslations } from "next-intl/server";
import type { CriterionResult } from "@/lib/types";
import { formatCriterionValue } from "@/lib/criteriaText";
import Panel from "./Panel";
import InfoTip from "./InfoTip";
import { scoreColor } from "./ScoreBar";

function StatusDot({ passed }: { passed: boolean }) {
  const color = passed ? "var(--up)" : "var(--down)";
  return (
    <span
      className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full"
      style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke={color} strokeWidth="2.2">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={passed ? "m2.5 6.2 2.4 2.4 4.6-5" : "M3.2 3.2l5.6 5.6M8.8 3.2 3.2 8.8"}
        />
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

  const total = criteria.reduce((sum, c) => sum + c.points, 0);
  const max = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

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
        <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: scoreColor(total, max) }}>
          {Number.isFinite(total) ? total.toFixed(1) : tCommon("notAvailable")}
          <span className="font-normal text-ink-faint"> / {max}</span>
        </span>
      }
    >
      <ul className="divide-y divide-line">
        {criteria.map((c) => {
          const pct = Number.isFinite(c.points)
            ? Math.max(0, Math.min(1, c.points / c.maxPoints)) * 100
            : 0;
          return (
            <li key={c.id} className="flex gap-3 px-4 py-3.5">
              <StatusDot passed={c.passed} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-semibold text-ink">{t(`${c.id}.label`)}</span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-muted">
                    {Number.isFinite(c.points) ? c.points.toFixed(1) : tCommon("notAvailable")}
                    <span className="text-ink-faint"> / {c.maxPoints}</span>
                  </span>
                </div>

                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: c.passed ? "var(--up)" : "var(--warn)" }}
                  />
                </div>

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

                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{t(`${c.id}.explanation`)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

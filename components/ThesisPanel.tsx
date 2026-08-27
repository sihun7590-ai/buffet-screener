import { getLocale, getTranslations } from "next-intl/server";
import { formatCriterionValue } from "@/lib/criteriaText";
import type { Thesis, ThesisPoint, ThesisRisk } from "@/lib/thesis";
import Panel from "./Panel";
import InfoTip from "./InfoTip";

// Each point shows the same label, measured value and threshold as the criteria
// table further down the page. That repetition is deliberate: it's what makes
// the case checkable. A reader who doubts a line can scroll to the criterion it
// names and find the identical number.
async function PointList({ points, tone }: { points: ThesisPoint[]; tone: "up" | "down" | "warn" }) {
  const locale = await getLocale();
  const t = await getTranslations("criteria");
  const tCommon = await getTranslations("common");
  const tTable = await getTranslations("stock.criteriaTable");
  const color = `var(--${tone})`;

  return (
    <ul className="flex flex-col gap-2.5">
      {points.map((p) => (
        <li key={p.criterionId} className="flex gap-2.5">
          <span
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <span className="text-[13px] font-semibold leading-snug text-ink">{t(`${p.criterionId}.label`)}</span>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
              <span>
                <span className="text-ink-faint">{tTable("actualValue")} </span>
                <span className="font-mono font-semibold tabular-nums" style={{ color }}>
                  {formatCriterionValue({ id: p.criterionId, values: p.values }, locale, (key) => tCommon(key))}
                </span>
              </span>
              <span>
                <span className="text-ink-faint">{tTable("threshold")} </span>
                <span className="font-mono tabular-nums text-ink-muted">{t(`${p.criterionId}.threshold`)}</span>
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

async function RiskList({ risks }: { risks: ThesisRisk[] }) {
  const locale = await getLocale();
  const t = await getTranslations("stock.thesis.risk");
  const tAxes = await getTranslations("axes");

  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(v);
  const num = (v: number, digits = 1) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  const usd = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v);

  // Each risk interpolates only the numbers its own message needs. Building the
  // arguments per id rather than passing one bag of everything keeps a missing
  // value a compile error instead of a "{value}" printed on screen.
  const text = (r: ThesisRisk): string => {
    switch (r.id) {
      case "negativeEquity":
        return t("negativeEquity");
      case "lossYears":
        return t("lossYears", { years: r.values.lossYears, total: r.values.totalYears });
      case "highLeverage":
        return t("highLeverage", { value: num(r.values.netDebtToEbitda) });
      case "negativeOwnerEarnings":
        return t("negativeOwnerEarnings", { value: usd(r.values.ownerEarningsPerShare) });
      case "dilution":
        return t("dilution", { value: pct(Math.abs(r.values.shareCountDelta)) });
      case "aboveIntrinsicValue":
        return t("aboveIntrinsicValue", { value: pct(Math.abs(r.values.marginOfSafety)) });
      case "lowCoverage":
        return t("lowCoverage", {
          axis: tAxes(`${r.axis}.name`),
          percent: Math.round(r.values.coverage * 100),
        });
    }
  };

  return (
    <ul className="flex flex-col gap-2">
      {risks.map((r) => (
        <li key={`${r.id}-${r.axis ?? ""}`} className="flex gap-2.5">
          <svg
            viewBox="0 0 12 12"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            fill="none"
            stroke="var(--warn)"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 1.6 11 10.4H1z M6 5.2v2.1 M6 8.9v.1" />
          </svg>
          <span className="text-[12px] leading-relaxed text-ink-muted">{text(r)}</span>
        </li>
      ))}
    </ul>
  );
}

function Column({
  label,
  tone,
  count,
  children,
}: {
  label: string;
  tone: "up" | "down" | "warn";
  count: number;
  children: React.ReactNode;
}) {
  const color = `var(--${tone})`;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-subtle px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color }}>
          {label}
        </span>
        <span
          className="rounded px-1.5 py-px font-mono text-[10px] font-bold tabular-nums"
          style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

export default async function ThesisPanel({ thesis }: { thesis: Thesis }) {
  const t = await getTranslations("stock.thesis");

  const { bull, bear, watch, risks } = thesis;
  // Nothing measurable at all — a company whose filing we could barely read.
  // An empty panel says less than no panel.
  if (bull.length === 0 && bear.length === 0 && watch.length === 0 && risks.length === 0) return null;

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip text={t("tip")} />
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Column label={t("bull")} tone="up" count={bull.length}>
          {bull.length > 0 ? (
            <PointList points={bull} tone="up" />
          ) : (
            <p className="text-[12px] leading-relaxed text-ink-faint">{t("bullEmpty")}</p>
          )}
        </Column>
        <Column label={t("bear")} tone="down" count={bear.length}>
          {bear.length > 0 ? (
            <PointList points={bear} tone="down" />
          ) : (
            <p className="text-[12px] leading-relaxed text-ink-faint">{t("bearEmpty")}</p>
          )}
        </Column>
      </div>

      {thesis.inconclusive && (
        <p className="mt-3 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted">
          {t("inconclusive")}
        </p>
      )}

      {(risks.length > 0 || watch.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {risks.length > 0 && (
            <Column label={t("risks")} tone="warn" count={risks.length}>
              <RiskList risks={risks} />
            </Column>
          )}
          {watch.length > 0 && (
            <Column label={t("watch")} tone="warn" count={watch.length}>
              <p className="-mt-1 text-[11px] leading-relaxed text-ink-faint">{t("watchNote")}</p>
              <PointList points={watch} tone="warn" />
            </Column>
          )}
        </div>
      )}

      <p className="mt-3.5 text-[11px] leading-relaxed text-ink-faint">{t("method")}</p>
    </Panel>
  );
}

import { getLocale, getTranslations } from "next-intl/server";
import type { FairValueSummary } from "@/lib/fairValue";
import Panel from "./Panel";
import InfoTip from "./InfoTip";

// Where the price sits relative to the blended estimate. The bands are wide on
// purpose: these estimates disagree with each other by more than a few percent
// routinely, so a 3% gap is not a finding and shouldn't be labelled as one.
const UNDERVALUED_AT = 0.15;
const OVERVALUED_AT = -0.15;

function status(mos: number): { key: "undervalued" | "fair" | "overvalued"; tone: "up" | "down" | "warn" } {
  if (!Number.isFinite(mos)) return { key: "fair", tone: "warn" };
  if (mos >= UNDERVALUED_AT) return { key: "undervalued", tone: "up" };
  if (mos <= OVERVALUED_AT) return { key: "overvalued", tone: "down" };
  return { key: "fair", tone: "warn" };
}

export default async function FairValuePanel({ summary }: { summary: FairValueSummary }) {
  const locale = await getLocale();
  const t = await getTranslations("stock.fairValue");
  const tCommon = await getTranslations("common");
  const tGlossary = await getTranslations("glossary");

  const na = tCommon("notAvailable");
  const usd = (v: number) =>
    Number.isFinite(v) ? new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(v) : na;
  const pct = (v: number, digits = 1) =>
    Number.isFinite(v)
      ? new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
      : na;
  const num = (v: number, digits = 1) =>
    Number.isFinite(v)
      ? new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v)
      : na;

  const { weightedFairValue, weightedMarginOfSafety, currentPrice, low, high } = summary;
  const st = status(weightedMarginOfSafety);
  const stColor = `var(--${st.tone})`;

  // Every method's inputs are shown rather than described, because the whole
  // claim of this panel is that the numbers can be checked. Building the line
  // per method keeps a missing input a compile error instead of a stray "{eps}".
  const assumptions = (m: FairValueSummary["estimates"][number]): string => {
    switch (m.method) {
      case "dcf":
        return t("assumptions.dcf", {
          owner: usd(m.inputs.ownerEarningsPerShare),
          growth: pct(m.inputs.growthRateUsed),
          discount: pct(m.inputs.discountRate),
          terminal: pct(m.inputs.terminalGrowthRate),
        });
      case "historicalPe":
        return t("assumptions.historicalPe", { pe: num(m.inputs.peOwnAvg), eps: usd(m.inputs.eps) });
      case "sectorPe":
        return t("assumptions.sectorPe", { pe: num(m.inputs.sectorPe, 0), eps: usd(m.inputs.eps) });
      case "graham":
        return t("assumptions.graham");
    }
  };

  // Price placed inside the spread of the estimates. When every method agrees
  // the range collapses and the marker would sit at an arbitrary end, so the
  // bar only appears once the estimates actually disagree.
  const spread = high - low;
  const showRange = Number.isFinite(spread) && spread > 0 && Number.isFinite(currentPrice);
  const markerPct = showRange ? Math.max(0, Math.min(100, ((currentPrice - low) / spread) * 100)) : 0;

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip text={t("tip")} />
        </span>
      }
      trailing={
        <span className="text-[11px] text-ink-muted">{t("methodCount", { count: summary.availableCount })}</span>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-line bg-subtle px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{t("currentPrice")}</div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-ink">{usd(currentPrice)}</div>
        </div>
        <div className="rounded-lg border border-line bg-subtle px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {t("weighted")}
            <InfoTip text={t("weightedTip")} />
          </div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-brand-text">{usd(weightedFairValue)}</div>
        </div>
        <div className="rounded-lg border border-line bg-subtle px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {t("marginOfSafety")}
            <InfoTip text={tGlossary("marginOfSafety")} />
          </div>
          <div className="mt-1.5 font-mono text-xl font-bold tabular-nums" style={{ color: stColor }}>
            {pct(weightedMarginOfSafety)}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-subtle px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{t("status")}</div>
          <div className="mt-1.5 text-[15px] font-extrabold uppercase tracking-[0.04em]" style={{ color: stColor }}>
            {t(`statusValue.${st.key}`)}
          </div>
        </div>
      </div>

      {summary.wideSpread && (
        <p className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-[12px] leading-relaxed text-warn">
          {t("wideSpread", { ratio: (summary.high / summary.low).toFixed(1) })}
        </p>
      )}

      {showRange && (
        <div className="mt-4">
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-[13px] h-1.5 rounded-full bg-line" />
            <span
              className="absolute top-[7px] h-[14px] w-[3px] rounded-full"
              style={{ left: `calc(${markerPct}% - 1.5px)`, background: stColor }}
              aria-hidden="true"
            />
          </div>
          <div className="flex justify-between font-mono text-[11px] tabular-nums text-ink-faint">
            <span>{t("lowest", { value: usd(low) })}</span>
            <span style={{ color: stColor }}>{t("priceMarker", { value: usd(currentPrice) })}</span>
            <span>{t("highest", { value: usd(high) })}</span>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              <th className="px-2 py-2 text-left font-semibold">{t("columns.method")}</th>
              <th className="px-2 py-2 text-right font-semibold">{t("columns.value")}</th>
              <th className="px-2 py-2 text-right font-semibold">{t("columns.marginOfSafety")}</th>
              <th className="px-2 py-2 text-right font-semibold">{t("columns.weight")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {summary.estimates.map((m) => {
              const usable = Number.isFinite(m.value);
              return (
                <tr key={m.method} className={usable ? "" : "bg-subtle/50"}>
                  <td className="px-2 py-2.5 text-left align-top">
                    <span className={`text-[12px] font-semibold ${usable ? "text-ink" : "text-ink-muted"}`}>
                      {t(`method.${m.method}`)}
                    </span>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-faint">
                      {usable ? assumptions(m) : t("methodUnavailable")}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] font-semibold tabular-nums text-ink">
                    {usd(m.value)}
                  </td>
                  <td
                    className="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] tabular-nums"
                    style={{ color: usable ? (m.marginOfSafety > 0 ? "var(--up)" : "var(--down)") : "var(--ink-faint)" }}
                  >
                    {pct(m.marginOfSafety, 0)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] tabular-nums text-ink-muted">
                    {m.weight > 0 ? pct(m.weight, 0) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {Number.isFinite(summary.impliedGrowthRate) && (
        <p className="mt-4 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">{t("reverseDcf.label")} </span>
          {t("reverseDcf.body", {
            implied: pct(summary.impliedGrowthRate),
            assumed: pct(summary.assumedGrowthRate),
          })}
        </p>
      )}

      <p className="mt-3.5 text-[11px] leading-relaxed text-ink-faint">{t("note")}</p>
    </Panel>
  );
}

import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { PeerComparison as Comparison, PeerRank, PeerRow } from "@/lib/peers";
import Panel from "./Panel";
import InfoTip from "./InfoTip";
import { scoreColor } from "./ScoreBar";

// A bar for the company's score with a tick where the sector's middle sits.
// Rank alone ("11th of 73") doesn't say whether the field is tightly bunched
// or spread out; the gap between the fill and the tick does.
function RankBar({ value, median }: { value: number; median: number }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const tick = Number.isFinite(median) ? Math.max(0, Math.min(100, median)) : null;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: Number.isFinite(value) ? scoreColor(value, 100) : "var(--ink-faint)" }}
      />
      {tick !== null && (
        <span
          className="absolute top-0 h-full w-px bg-ink/50"
          style={{ left: `${tick}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export default async function PeerComparison({ comparison }: { comparison: Comparison }) {
  const locale = await getLocale();
  const t = await getTranslations("peers");
  const tAxes = await getTranslations("axes");
  const tStock = await getTranslations("stock");
  const tSectors = await getTranslations("sectors");
  const tCommon = await getTranslations("common");

  const na = tCommon("notAvailable");
  const num = (v: number, digits = 2) =>
    Number.isFinite(v) ? new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v) : na;
  const pct = (v: number) =>
    Number.isFinite(v)
      ? new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(v)
      : na;
  const cap = (v: number) =>
    Number.isFinite(v)
      ? new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(v)
      : na;
  const day = (iso: string) =>
    iso ? new Intl.DateTimeFormat(locale, { year: "2-digit", month: "short" }).format(new Date(iso)) : na;

  const label = (r: PeerRank) => (r.metric === "total" ? tStock("stats.total") : tAxes(`${r.metric}.name`));

  const Cell = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <td className={`whitespace-nowrap px-3 py-2 text-right font-mono text-[12px] tabular-nums ${className}`}>
      {children}
    </td>
  );

  const rowTone = (row: PeerRow) =>
    row.isSelf ? "bg-brand/10 font-semibold" : "hover:bg-subtle";

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip text={t("tip")} />
        </span>
      }
      padded={false}
      trailing={
        <span className="text-[11px] text-ink-muted">
          {tSectors(comparison.sector)} · {t("peerCount", { count: comparison.peerCount })}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {/* Narrow screens put the label and the numbers on one line and give
            the bar its own full-width row beneath; squeezed into a third of
            375px the bar can't show a median tick anyone can read. */}
        {comparison.ranks.map((r) => (
          <div
            key={r.metric}
            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(72px,auto)_1fr_auto]"
          >
            <span className="order-1 text-[11px] font-semibold text-ink-muted">{label(r)}</span>
            <span className="order-3 col-span-2 sm:order-2 sm:col-span-1">
              <RankBar value={r.value} median={r.sectorMedian} />
            </span>
            <span className="order-2 flex items-baseline gap-2 font-mono text-[11px] tabular-nums sm:order-3">
              <span className="font-bold" style={{ color: scoreColor(r.value, 100) }}>
                {num(r.value, 0)}
              </span>
              <span className="text-ink-muted">
                {Number.isFinite(r.rank) ? t("rankOf", { rank: r.rank, count: r.ranked }) : na}
              </span>
              <span className="text-ink-faint">{t("median", { value: num(r.sectorMedian, 0) })}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-ink-faint">
              <th className="px-3 py-2 text-left font-semibold">{t("columns.company")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("columns.marketCap")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("columns.roe")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("columns.debtToEquity")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("columns.pe")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("columns.marginOfSafety")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("columns.total")}</th>
              <th className="px-3 py-2 text-right font-semibold">{t("columns.period")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {comparison.rows.map((row) => (
              <tr key={row.ticker} className={rowTone(row)}>
                <td className="whitespace-nowrap px-3 py-2 text-left">
                  {row.isSelf ? (
                    <span className="font-mono text-[12px] font-bold text-brand">{row.ticker}</span>
                  ) : (
                    <Link
                      href={`/${locale}/stock/${row.ticker}`}
                      className="font-mono text-[12px] text-ink hover:text-brand hover:underline"
                    >
                      {row.ticker}
                    </Link>
                  )}
                  <span className="ml-2 text-[11px] text-ink-faint">{row.companyName}</span>
                </td>
                <Cell className="text-ink-muted">{cap(row.marketCap)}</Cell>
                <Cell className="text-ink-muted">{pct(row.roe)}</Cell>
                <Cell className="text-ink-muted">{num(row.debtToEquity)}</Cell>
                <Cell className="text-ink-muted">{num(row.currentPe, 1)}</Cell>
                <Cell className={Number.isFinite(row.marginOfSafety) && row.marginOfSafety > 0 ? "text-up" : "text-ink-muted"}>
                  {pct(row.marginOfSafety)}
                </Cell>
                <Cell>
                  <span style={{ color: scoreColor(row.totalScore, 100) }}>{num(row.totalScore, 1)}</span>
                </Cell>
                <Cell className="text-ink-faint">
                  {day(row.periodEnd)}
                  {row.minCoverage < 1 && (
                    <span className="ml-1 text-warn" title={t("lowCoverage", { percent: Math.round(row.minCoverage * 100) })}>
                      *
                    </span>
                  )}
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-faint">{t("caveat")}</p>
    </Panel>
  );
}

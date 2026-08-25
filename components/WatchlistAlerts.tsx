import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RATIO_KINDS, type StockAlert } from "@/lib/alerts";
import Panel from "./Panel";
import InfoTip from "./InfoTip";

export default async function WatchlistAlerts({ alerts }: { alerts: StockAlert[] }) {
  const locale = await getLocale();
  const t = await getTranslations("alerts");
  const tAxes = await getTranslations("axes");

  const pct = (v: number) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(v);
  const points = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { year: "2-digit", month: "short", day: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

  function describe(a: StockAlert): string {
    const axis = a.axis ? tAxes(`${a.axis}.name`) : "";
    if (RATIO_KINDS.has(a.kind)) {
      return t(`kinds.${a.kind}`, { from: pct(a.from), to: pct(a.to), change: pct(a.delta) });
    }
    return t(`kinds.${a.kind}`, {
      axis,
      from: points(a.from),
      to: points(a.to),
      change: (a.delta > 0 ? "+" : "") + points(a.delta),
    });
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip text={t("tip")} />
        </span>
      }
      padded={false}
      trailing={alerts.length > 0 ? <span className="text-[11px] text-ink-muted">{t("count", { count: alerts.length })}</span> : null}
    >
      {alerts.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-faint">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {alerts.map((a, i) => (
            <li key={`${a.ticker}-${a.kind}-${a.axis ?? ""}-${i}`} className="flex items-start gap-3 px-4 py-3">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ background: a.severity === "warn" ? "var(--down)" : "var(--up)" }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Link href={`/stock/${a.ticker}`} className="font-mono text-[13px] font-bold text-ink hover:text-brand hover:underline">
                    {a.ticker}
                  </Link>
                  <span className="text-[13px] text-ink-muted">{describe(a)}</span>
                </div>
                {a.since && (
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {t("since", { date: day(a.since) })}
                    {a.sinceBackfilled ? ` · ${t("backfilled")}` : ""}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-faint">{t("caveat")}</p>
    </Panel>
  );
}

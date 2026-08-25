import { getLocale, getTranslations } from "next-intl/server";
import type { InsiderTransaction } from "@/lib/insiderTrading";
import Panel from "./Panel";
import InfoTip from "./InfoTip";

// One compact chip per insider row rather than three separate columns — an
// insider is usually just one of these (an officer, say), and stacking
// "Director / Officer / 10%+ Owner" as always-present columns would leave
// two of three blank on almost every row. officerTitle comes straight from
// the filing (a company-specific title like "SVP, GC and Secretary") and
// isn't translated — it's a quoted fact, not UI copy.
function RoleBadge({
  tx,
  roleLabels,
}: {
  tx: InsiderTransaction;
  roleLabels: { director: string; officer: string; tenPercentOwner: string };
}) {
  const parts: string[] = [];
  if (tx.isOfficer) parts.push(tx.officerTitle ?? roleLabels.officer);
  if (tx.isDirector) parts.push(roleLabels.director);
  if (tx.isTenPercentOwner) parts.push(roleLabels.tenPercentOwner);

  if (parts.length === 0) return null;

  return <span className="mt-0.5 block text-[11px] text-ink-faint">{parts.join(" · ")}</span>;
}

export default async function InsiderActivity({ transactions }: { transactions: InsiderTransaction[] }) {
  const locale = await getLocale();
  const t = await getTranslations("insiderTrading");
  const tCommon = await getTranslations("common");

  const na = tCommon("notAvailable");
  const dateFmt = (iso: string) => new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));
  const sharesFmt = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
  const usdFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
  const usdCompactFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);

  const roleLabels = { director: t("role.director"), officer: t("role.officer"), tenPercentOwner: t("role.tenPercentOwner") };

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          {t("title")}
          <InfoTip text={t("tip")} />
        </span>
      }
      padded={false}
    >
      {transactions.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-faint">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                <th className="px-3 py-2 text-left font-semibold">{t("columns.date")}</th>
                <th className="px-3 py-2 text-left font-semibold">{t("columns.insider")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("columns.direction")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("columns.shares")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("columns.price")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("columns.value")}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("columns.source")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {transactions.map((tx, i) => {
                const acquired = tx.direction === "A";
                return (
                  <tr key={`${tx.filingUrl}-${i}`} className="hover:bg-subtle">
                    <td className="whitespace-nowrap px-3 py-2.5 text-left font-mono text-[12px] tabular-nums text-ink-muted">
                      {dateFmt(tx.transactionDate)}
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      <span className="text-[13px] font-medium text-ink">{tx.insiderName || na}</span>
                      <RoleBadge tx={tx} roleLabels={roleLabels} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <span
                        className="font-mono text-[12px] font-bold tabular-nums"
                        style={{ color: acquired ? "var(--up)" : "var(--down)" }}
                        title={tx.transactionCode}
                      >
                        {acquired ? "▲" : "▼"} {acquired ? t("direction.acquired") : t("direction.disposed")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-muted">
                      {sharesFmt(tx.shares)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink-muted">
                      {tx.pricePerShare !== null ? usdFmt(tx.pricePerShare) : na}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-[12px] tabular-nums text-ink">
                      {tx.totalValue !== null ? usdCompactFmt(tx.totalValue) : na}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <a
                        href={tx.filingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-brand hover:underline"
                      >
                        {t("sourceLink")}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-faint">{t("caveat")}</p>
    </Panel>
  );
}

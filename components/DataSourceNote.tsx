import { getFormatter, getTranslations } from "next-intl/server";
import type { DataProvenance } from "@/lib/types";
import InfoTip from "./InfoTip";

// Says where a number came from and what stretch of time it covers. Without
// it, "ROE 15%" could be a quarter that closed last month or a fiscal year
// that ended eleven months ago, and nothing on screen would distinguish them —
// which matters most for exactly the companies whose situation has changed.
export default async function DataSourceNote({
  provenance,
  generatedAt,
}: {
  provenance?: DataProvenance;
  generatedAt: string;
}) {
  const t = await getTranslations("dataSource");
  const format = await getFormatter();

  const day = (iso: string) => (iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "—");

  const parts = [
    t("financials"),
    provenance
      ? provenance.periodType === "ttm"
        ? t("periodTtm", { date: day(provenance.periodEnd) })
        : t("periodAnnual", { date: day(provenance.periodEnd) })
      : null,
    t("prices"),
    t("updated", { date: day(generatedAt) }),
  ].filter(Boolean) as string[];

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-ink-faint">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">·</span>}
          {part}
        </span>
      ))}
      <InfoTip text={t("tip")} />
    </p>
  );
}

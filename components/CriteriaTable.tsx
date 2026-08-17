import { getLocale, getTranslations } from "next-intl/server";
import type { CriterionResult } from "@/lib/types";
import { formatCriterionValue } from "@/lib/criteriaText";

export default async function CriteriaTable({ title, criteria }: { title: string; criteria: CriterionResult[] }) {
  const locale = await getLocale();
  const t = await getTranslations("criteria");
  const tTable = await getTranslations("stock.criteriaTable");
  const tCommon = await getTranslations("common");

  const total = criteria.reduce((sum, c) => sum + c.points, 0);
  const max = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

  return (
    <div className="rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {Number.isFinite(total) ? total.toFixed(1) : tCommon("notAvailable")} / {max}
        </span>
      </div>
      <ul className="divide-y divide-black/5 dark:divide-white/5">
        {criteria.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${c.passed ? "bg-emerald-500" : "bg-rose-400"}`} />
                {t(`${c.id}.label`)}
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {Number.isFinite(c.points) ? c.points.toFixed(1) : tCommon("notAvailable")} / {c.maxPoints}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 text-sm text-zinc-600 dark:text-zinc-300">
              <span>
                {tTable("actualValue")}: {formatCriterionValue(c, locale, (key) => tCommon(key))}
              </span>
              <span>
                {tTable("threshold")}: {t(`${c.id}.threshold`)}
              </span>
            </div>
            <p className="text-xs text-zinc-400">{t(`${c.id}.explanation`)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

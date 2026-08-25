import { getTranslations } from "next-intl/server";
import Dashboard from "@/components/Dashboard";
import DataSourceNote from "@/components/DataSourceNote";
import { readScores } from "@/lib/store";

// scores.json changes whenever `npm run refresh` runs; read it fresh on
// every request instead of baking it into the build.
export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const { scores, generatedAt, source } = readScores();

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{t("title")}</h1>
          {generatedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-1 text-[11px] text-ink-muted">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-up" />
              </span>
              <span className="font-mono tabular-nums">
                {t("asOf", { date: new Date(generatedAt).toLocaleString(locale) })}
              </span>
            </span>
          )}
        </div>
        <p className="max-w-3xl text-[13px] leading-relaxed text-ink-muted">{t("subtitle")}</p>
      </div>

      {source === "fixture" && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] text-warn">
          {t.rich("fixtureBanner", {
            strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
            code: (chunks) => (
              <code className="rounded bg-warn/15 px-1 py-0.5 font-mono text-[12px]">{chunks}</code>
            ),
          })}
        </div>
      )}

      {scores.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-16 text-center text-sm text-ink-muted shadow-[var(--shadow)]">
          {t.rich("emptyState", {
            code: (chunks) => (
              <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-ink">{chunks}</code>
            ),
          })}
        </div>
      ) : (
        <Dashboard scores={scores} />
      )}

      <footer className="mt-auto flex flex-col gap-2 border-t border-line pt-4 text-[11px] leading-relaxed text-ink-faint">
        <DataSourceNote generatedAt={generatedAt} />
        {tc("disclaimer")}
      </footer>
    </main>
  );
}

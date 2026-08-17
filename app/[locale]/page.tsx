import { getTranslations } from "next-intl/server";
import Dashboard from "@/components/Dashboard";
import LocaleSwitcher from "@/components/LocaleSwitcher";
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
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
              {t("subtitle")}
              {generatedAt && ` ${t("asOf", { date: new Date(generatedAt).toLocaleString(locale) })}`}
            </p>
          </div>
          <LocaleSwitcher />
        </header>

        {source === "fixture" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {t.rich("fixtureBanner", {
              strong: (chunks) => <strong>{chunks}</strong>,
              code: (chunks) => <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">{chunks}</code>,
            })}
          </div>
        )}

        {scores.length === 0 ? (
          <div className="rounded-xl border border-black/10 bg-white p-10 text-center text-zinc-500 dark:border-white/10 dark:bg-zinc-900">
            {t.rich("emptyState", {
              code: (chunks) => <code className="rounded bg-black/10 px-1 py-0.5 dark:bg-white/10">{chunks}</code>,
            })}
          </div>
        ) : (
          <Dashboard scores={scores} />
        )}

        <footer className="mt-auto pt-6 text-xs text-zinc-400">{tc("disclaimer")}</footer>
      </main>
    </div>
  );
}

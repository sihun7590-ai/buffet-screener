import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Panel from "@/components/Panel";
import BackToListLink from "@/components/BackToListLink";
import MyFavoritesList, { type MyFavoriteRow } from "@/components/MyFavoritesList";
import { createClient } from "@/lib/supabase/server";
import { getScoreByTicker } from "@/lib/store";
import { fetchPriceHistory } from "@/lib/price";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const t = await getTranslations("mypage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <BackToListLink />
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{t("title")}</h1>
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-ink-muted">{t("signInPrompt")}</p>
            <Link
              href="/login"
              className="rounded-md bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t("signInCta")}
            </Link>
          </div>
        </Panel>
      </main>
    );
  }

  const { data: favRows } = await supabase
    .from("favorites")
    .select("ticker, price_at_favorite, favorited_at")
    .order("favorited_at", { ascending: false });

  const rows: MyFavoriteRow[] = await Promise.all(
    (favRows ?? []).map(async (f) => {
      const score = getScoreByTicker(f.ticker);
      let currentPrice = score?.price ?? NaN;
      try {
        currentPrice = (await fetchPriceHistory(f.ticker)).currentPrice;
      } catch {
        // Live quote failed — the cached scoring price is still a reasonable fallback.
      }
      return {
        ticker: f.ticker,
        companyName: score?.companyName ?? f.ticker,
        sector: score?.sector ?? "",
        totalScore: score?.totalScore ?? NaN,
        isBuyCandidate: score?.isBuyCandidate ?? false,
        priceAtFavorite: f.price_at_favorite,
        currentPrice,
        favoritedAt: f.favorited_at,
      };
    }),
  );

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <BackToListLink />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{t("title")}</h1>
        <p className="text-[13px] text-ink-muted">{t("subtitle")}</p>
      </div>
      <MyFavoritesList userId={user.id} initialRows={rows} />
    </main>
  );
}

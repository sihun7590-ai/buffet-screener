import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import Panel from "@/components/Panel";
import BackToListLink from "@/components/BackToListLink";
import MyFavoritesList, { type MyFavoriteRow } from "@/components/MyFavoritesList";
import WatchlistAlerts from "@/components/WatchlistAlerts";
import PortfolioPanel from "@/components/PortfolioPanel";
import ThesisBreakerPanel from "@/components/ThesisBreakerPanel";
import AlertSettingsPanel from "@/components/AlertSettingsPanel";
import { createClient } from "@/lib/supabase/server";
import { getScoreByTicker, readScores } from "@/lib/store";
import { fetchPriceHistory } from "@/lib/price";
import { fetchScoreHistoryForTickers } from "@/lib/scoreHistoryQuery";
import { detectAlerts, groupAlertsByTicker, normalizeAlertSettings, type StockAlert } from "@/lib/alerts";
import { summarizePortfolio, type Holding } from "@/lib/portfolio";
import { checkPortfolioBreakers, type BreakerRule } from "@/lib/thesisBreakers";
import type { StockScore } from "@/lib/types";

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

  // One round trip for everything this page needs from Postgres. RLS scopes
  // each of these to the signed-in user, so none of them carries a user filter.
  //
  // The three tables from migration 004 are read defensively. supabase-js
  // reports a missing table as an error object rather than throwing, so a
  // project where the migration hasn't been run yet gets null here, falls
  // through to empty lists below, and renders the empty states — the watchlist
  // it already had keeps working instead of the page 500ing.
  const [{ data: favRows }, { data: holdingRows }, { data: breakerRows }, { data: settingsRow }] = await Promise.all([
    supabase.from("favorites").select("ticker, price_at_favorite, favorited_at").order("favorited_at", { ascending: false }),
    supabase.from("holdings").select("ticker, shares, average_cost, note").order("ticker"),
    supabase.from("thesis_breakers").select("id, metric, op, value").order("created_at"),
    supabase
      .from("alert_settings")
      .select("total_threshold, axis_threshold, price_drop_threshold, lookback_days")
      .maybeSingle(),
  ]);

  // A user who has never opened the settings has no row, which is not an error
  // — normalizeAlertSettings turns null into exactly the shipped defaults.
  const alertSettings = normalizeAlertSettings(
    settingsRow
      ? {
          totalThreshold: settingsRow.total_threshold,
          axisThreshold: settingsRow.axis_threshold,
          priceDropThreshold: settingsRow.price_drop_threshold,
          lookbackDays: settingsRow.lookback_days,
        }
      : null,
  );

  const holdings: Holding[] = (holdingRows ?? []).map((h) => ({
    ticker: h.ticker,
    shares: h.shares,
    averageCost: h.average_cost,
    note: h.note,
  }));

  const breakerRules: BreakerRule[] = (breakerRows ?? []).map((b) => ({
    id: b.id,
    metric: b.metric,
    op: b.op as BreakerRule["op"],
    value: b.value,
  }));

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
        marginOfSafety: score?.intrinsicValue.marginOfSafety ?? NaN,
        priceAtFavorite: f.price_at_favorite,
        currentPrice,
        favoritedAt: f.favorited_at,
      };
    }),
  );

  // One query for the whole list, then compare each company against its own
  // past. The favourite price is the other half: it's the only record of what
  // the holding looked like when the user decided they cared.
  const history = await fetchScoreHistoryForTickers(rows.map((r) => r.ticker));
  const alerts: StockAlert[] = groupAlertsByTicker(
    rows.flatMap((row) => {
      const score = getScoreByTicker(row.ticker);
      if (!score) return [];
      return detectAlerts({
        score,
        history: history.get(row.ticker) ?? [],
        priceAtFavorite: row.priceAtFavorite,
        currentPrice: row.currentPrice,
        settings: alertSettings,
      });
    }),
  );

  // Live prices were already fetched for the favourites above; holdings reuse
  // them where the ticker overlaps and only fetch what's left.
  const favouritePrices = new Map(rows.map((r) => [r.ticker, r.currentPrice]));
  const holdingPrices = new Map<string, number>(
    await Promise.all(
      holdings.map(async (h): Promise<[string, number]> => {
        const known = favouritePrices.get(h.ticker);
        if (Number.isFinite(known ?? NaN)) return [h.ticker, known!];
        try {
          return [h.ticker, (await fetchPriceHistory(h.ticker)).currentPrice];
        } catch {
          // Falls back to the snapshot price inside summarizePortfolio.
          return [h.ticker, NaN];
        }
      }),
    ),
  );

  const scoresByTicker = new Map<string, StockScore>(readScores().scores.map((s) => [s.ticker, s]));
  const portfolio = summarizePortfolio(holdings, scoresByTicker, (ticker) => holdingPrices.get(ticker) ?? NaN);

  // Breakers watch everything the user has expressed an interest in — held and
  // merely favourited alike. Someone tracking a company they haven't bought yet
  // still wants to know the moment the reason to buy it stopped applying.
  const watchedTickers = [...new Set([...holdings.map((h) => h.ticker), ...rows.map((r) => r.ticker)])];
  const watchedScores = watchedTickers.map((tk) => scoresByTicker.get(tk)).filter((s): s is StockScore => s !== undefined);
  const firedBreakers = checkPortfolioBreakers(watchedScores, breakerRules);

  const knownTickers = [...scoresByTicker.keys()].sort();

  const avgScore = rows.length
    ? rows.map((r) => r.totalScore).filter(Number.isFinite).reduce((sum, v, _, arr) => sum + v / arr.length, 0)
    : NaN;
  const buyCandidateCount = rows.filter((r) => r.isBuyCandidate).length;

  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <BackToListLink />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{t("title")}</h1>
        <p className="text-[13px] text-ink-muted">{t("subtitle")}</p>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-[18px]">
            <span className="text-[11px] font-semibold text-ink-4">{t("summary.favorites")}</span>
            <span className="font-mono text-[26px] font-bold tabular-nums text-ink">{rows.length}</span>
          </div>
          <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-[18px]">
            <span className="text-[11px] font-semibold text-ink-4">{t("summary.avgScore")}</span>
            <span className="font-mono text-[26px] font-bold tabular-nums text-up">
              {Number.isFinite(avgScore) ? avgScore.toFixed(1) : "N/A"}
            </span>
          </div>
          <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-[18px]">
            <span className="text-[11px] font-semibold text-ink-4">{t("summary.buyCandidates")}</span>
            <span className="font-mono text-[26px] font-bold tabular-nums text-brand">{buyCandidateCount}</span>
          </div>
        </div>
      )}

      <PortfolioPanel summary={portfolio} userId={user.id} knownTickers={knownTickers} />

      <ThesisBreakerPanel
        rules={breakerRules}
        fired={firedBreakers}
        userId={user.id}
        watchedCount={watchedScores.length}
      />

      {rows.length > 0 && <WatchlistAlerts alerts={alerts} />}
      <AlertSettingsPanel settings={alertSettings} userId={user.id} />
      <MyFavoritesList userId={user.id} initialRows={rows} />
    </main>
  );
}

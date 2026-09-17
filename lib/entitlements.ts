// Who can see what.
//
// This exists before any billing does, on purpose. Charging for a stock-research
// site in Korea needs a business registration and a 유사투자자문업 filing first,
// and the share prices this site runs on come from Yahoo endpoints whose terms
// forbid commercial use — neither is a code problem, and both have to be settled
// before money changes hands. What *can* be built ahead of them is the line
// between tiers, so that switching payments on later means wiring a checkout to
// this file rather than threading access checks through thirty components.
//
// Nothing here is enforced until PAYWALL_ENABLED is set (see
// lib/supabase/entitlement.ts). Until then every visitor resolves to the top
// tier and the site behaves exactly as it did before this file existed.
//
// Pure functions only — no fetching, no environment, no Supabase — so the rules
// can be checked without a network, same as lib/scoring.ts.
import type { StockScore } from "./types";

export const TIERS = ["free", "pro", "premium"] as const;
export type Tier = (typeof TIERS)[number];

const RANK: Record<Tier, number> = { free: 0, pro: 1, premium: 2 };

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

/**
 * The lowest tier each feature is available on. This is the whole pricing
 * model in one place: moving a feature between tiers is a one-word edit here
 * and nowhere else.
 *
 * What stays free is the screener itself — every company, its five axis scores
 * and its total, its price chart and news. That is the part that shows what the
 * site does. What costs money is the reasoning underneath (which criteria
 * produced a score, what the company is worth, how it compares, how it has
 * moved) and the tools that act on it.
 *
 * The watchlist itself stays free even though the brief listed it under Pro:
 * favoriting is the reason to create an account at all, and gating the first
 * thing a new user tries would mostly teach them not to sign up. The alerts and
 * monitoring built on top of the watchlist are Pro.
 */
export const FEATURES = {
  // --- free -----------------------------------------------------------------
  screener: "free",
  watchlist: "free",

  // --- pro ------------------------------------------------------------------
  /** Criterion-by-criterion tables: which measurements produced each axis score. */
  criteriaDetail: "pro",
  /** Intrinsic value and margin of safety, anywhere they appear — including the dashboard. */
  fairValue: "pro",
  /** Rule-derived bull case, bear case, risks and what to watch. */
  thesis: "pro",
  peerComparison: "pro",
  scoreHistory: "pro",
  insiderTrading: "pro",
  dcaSimulator: "pro",
  customWeights: "pro",
  watchlistAlerts: "pro",
  alertSettings: "pro",
  thesisBreakers: "pro",
  portfolio: "pro",

  // --- premium --------------------------------------------------------------
  backtest: "premium",
  strategyBuilder: "premium",
  csvExport: "premium",
} as const satisfies Record<string, Tier>;

export type Feature = keyof typeof FEATURES;

export function requiredTier(feature: Feature): Tier {
  return FEATURES[feature];
}

export function canAccess(tier: Tier, feature: Feature): boolean {
  return RANK[tier] >= RANK[FEATURES[feature]];
}

/**
 * Strips what `tier` isn't entitled to out of a score before it leaves the
 * server.
 *
 * Hiding a panel is not the same as not sending its data. The dashboard is a
 * client component handed the whole snapshot as props, which means every field
 * in it lands in the page payload whether or not anything renders it — a free
 * user could read every company's margin of safety out of the network tab.
 * Removing the fields here is what makes the gate real rather than cosmetic.
 *
 * The shape is preserved (NaN and empty arrays rather than missing keys) because
 * every consumer already treats a non-finite number as "not available", which
 * is the right thing for them to show.
 *
 * One thing is knowingly left in: `isBuyCandidate`. Being a Buy Candidate
 * requires a positive margin of safety, so a free user can infer the sign — but
 * not the size — of that number for the ~27 companies that qualify. The badge is
 * the screener's headline output and part of what free is meant to show;
 * removing it to hide a sign bit would gut the free tier to protect very little.
 *
 * Coupling to watch: PortfolioPanel positions carry margin of safety too. That
 * is safe only while `portfolio` requires at least the tier `fairValue` does.
 * Move fairValue above portfolio and those positions need redacting as well.
 */
export function redactScore(score: StockScore, tier: Tier): StockScore {
  const keepCriteria = canAccess(tier, "criteriaDetail");
  const keepValuation = canAccess(tier, "fairValue");
  if (keepCriteria && keepValuation) return score;

  return {
    ...score,
    criteria: keepCriteria ? score.criteria : [],
    intrinsicValue: keepValuation
      ? score.intrinsicValue
      : {
          ...score.intrinsicValue,
          ownerEarningsPerShare: NaN,
          growthRateUsed: NaN,
          intrinsicValuePerShare: NaN,
          marginOfSafety: NaN,
        },
  };
}

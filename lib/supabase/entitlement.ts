// Server-only by construction: createClient reads next/headers, so importing
// this from a client component fails the build. (No `server-only` package —
// the repo keeps dependencies to a minimum, and the build already refuses.)
import { cache } from "react";
import { isTier, type Tier } from "@/lib/entitlements";
import { createClient } from "./server";

/**
 * Whether tiers are enforced at all.
 *
 * Off unless explicitly set to "true". A deployment that forgets the variable
 * gets the whole site open — the failure you want from a paywall that has no
 * checkout behind it yet, rather than locking every existing user out of
 * features they were using yesterday with no way to pay for them.
 *
 * Server-only on purpose (no NEXT_PUBLIC_ prefix): the tier is decided here and
 * handed down, never recomputed in the browser where it could be edited.
 */
export function paywallEnabled(): boolean {
  return process.env.PAYWALL_ENABLED === "true";
}

/**
 * The tier the current request is entitled to.
 *
 * Wrapped in React's `cache` so a page that gates six panels asks Supabase once
 * per request rather than six times.
 *
 * Every uncertain path resolves to "free": no session, no row, an expired
 * period, a value the code doesn't recognise, or a database error. The one
 * exception is the paywall being off, which grants everything — see
 * paywallEnabled.
 */
export const getViewerTier = cache(async (): Promise<Tier> => {
  if (!paywallEnabled()) return "premium";

  // Lets a developer see the site as each tier without a payment integration
  // or a hand-edited database row. Ignored in production builds so a stray
  // environment variable on Vercel can't hand every visitor a paid tier.
  const preview = process.env.PAYWALL_PREVIEW_TIER;
  if (process.env.NODE_ENV !== "production" && isTier(preview)) return preview;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "free";

  // Read defensively, like the other migration-backed tables: a project that
  // hasn't run 005 yet gets an error object here, not a throw, and falls to
  // free rather than taking the page down.
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("tier, current_period_end")
    .maybeSingle();
  if (error || !data || !isTier(data.tier)) return "free";

  // A subscription that lapsed without the payment provider's cancellation
  // webhook arriving should not keep granting access indefinitely. A null end
  // date means no expiry — a manually granted or lifetime tier.
  if (data.current_period_end && new Date(data.current_period_end).getTime() < Date.now()) return "free";

  return data.tier;
});

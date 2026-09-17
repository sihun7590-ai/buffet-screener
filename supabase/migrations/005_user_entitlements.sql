-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor → New query).
--
-- NOT NEEDED YET. The site only reads this table when PAYWALL_ENABLED=true is
-- set on the deployment. Until then everyone gets every feature and this table
-- is never queried. Run it when payments are being wired up.
--
-- Which tier each user is on. One row per paying user; no row means free.

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null check (tier in ('free', 'pro', 'premium')),
  -- When access ends. Checked on every request (lib/supabase/entitlement.ts),
  -- so a subscription whose cancellation webhook never arrived still lapses on
  -- time rather than granting access forever. Null means no expiry — a tier
  -- granted by hand, or a lifetime purchase.
  current_period_end timestamptz,
  -- Which system wrote this row: a payment provider's name, or 'manual' for a
  -- tier granted by hand. Useful the first time a support request asks why
  -- someone has access they didn't pay for.
  source text not null default 'manual',
  -- The payment provider's own customer / subscription identifiers, so a
  -- webhook can find the row it's updating without trusting an email address.
  provider_customer_id text,
  provider_subscription_id text,
  updated_at timestamptz not null default now()
);

alter table public.user_entitlements enable row level security;

-- Users can read their own tier, and nothing else.
--
-- There is deliberately no insert, update or delete policy. Every other table
-- in this project lets users write their own rows; this one must not. With RLS
-- on and no write policy, the browser's anon key cannot change a tier at all —
-- only the service_role key can, which bypasses RLS and lives only on the
-- server (a payment webhook, or a manual grant from the SQL Editor). A policy
-- letting users update their own row would let anyone open the console and
-- make themselves premium.
create policy "Users can view their own entitlement"
  on public.user_entitlements for select
  using (auth.uid() = user_id);

-- To grant a tier by hand while there is no checkout (for testing, or for early
-- users), run as the SQL Editor's default role:
--
--   insert into public.user_entitlements (user_id, tier, source)
--   select id, 'premium', 'manual' from auth.users where email = 'someone@example.com'
--   on conflict (user_id) do update set tier = excluded.tier, updated_at = now();

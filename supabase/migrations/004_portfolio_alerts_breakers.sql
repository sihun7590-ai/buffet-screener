-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor → New query).
--
-- Three tables, all per-user and all behind Row Level Security, added together
-- because they serve one idea: the site knowing what you actually hold and what
-- would change your mind about it.
--
--   holdings        — what you own, so returns and weights are real numbers
--                     rather than "since you favorited it"
--   alert_settings  — the thresholds lib/alerts.ts uses, per user instead of
--                     hardcoded
--   thesis_breakers — conditions that, when they come true, mean the reason
--                     you bought no longer holds

-- ---------------------------------------------------------------------------
-- holdings
-- ---------------------------------------------------------------------------
-- Separate from `favorites` on purpose. A favorite is "watch this"; a holding
-- is "I own this", and conflating them would make the portfolio total include
-- everything anyone was ever curious about. A ticker can legitimately be in
-- both, so there is no foreign key between them.
create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  -- Fractional shares are ordinary now, so this is not an integer.
  shares double precision not null check (shares > 0),
  -- Per share, in USD, after commissions if you want it that way — this is
  -- what return is measured against and nothing else reads it.
  average_cost double precision not null check (average_cost >= 0),
  note text,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per ticker per user: adding to a position edits the row and
  -- recomputes the average, rather than accumulating lots. Lot-level tracking
  -- is a different feature (tax reporting), not this one.
  unique (user_id, ticker)
);

alter table public.holdings enable row level security;

create policy "Users can view their own holdings"
  on public.holdings for select
  using (auth.uid() = user_id);

create policy "Users can add their own holdings"
  on public.holdings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own holdings"
  on public.holdings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove their own holdings"
  on public.holdings for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- alert_settings
-- ---------------------------------------------------------------------------
-- One row per user. The defaults here are the constants lib/alerts.ts shipped
-- with, so a user who never opens the settings sees exactly what they saw
-- before this table existed.
create table if not exists public.alert_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Points of total-score movement worth reporting.
  total_threshold double precision not null default 5 check (total_threshold > 0),
  -- Points of single-axis movement worth reporting.
  axis_threshold double precision not null default 12 check (axis_threshold > 0),
  -- Decimal, not percent: 0.25 is a 25% fall from your entry price.
  price_drop_threshold double precision not null default 0.25 check (price_drop_threshold > 0 and price_drop_threshold < 1),
  -- How far back to compare against. Roughly the gap between quarterly filings
  -- landing, which is what actually moves these scores.
  lookback_days integer not null default 30 check (lookback_days >= 1),
  updated_at timestamptz not null default now()
);

alter table public.alert_settings enable row level security;

create policy "Users can view their own alert settings"
  on public.alert_settings for select
  using (auth.uid() = user_id);

create policy "Users can create their own alert settings"
  on public.alert_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own alert settings"
  on public.alert_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own alert settings"
  on public.alert_settings for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- thesis_breakers
-- ---------------------------------------------------------------------------
-- Deliberately the same shape as a screen-builder condition (lib/strategy.ts):
-- a metric, a comparison, a threshold. A screen asks "which companies satisfy
-- this?"; a breaker asks "has this become true of something I own?" — the same
-- test read in the opposite direction, so it uses the same metric registry
-- rather than a second one that could drift out of step with it.
--
-- Rules are global to the user, applying to every watched and held company.
-- Per-company overrides are a real thing to want, but they need their own UI to
-- be worth having, and a column nothing writes to is worse than no column.
create table if not exists public.thesis_breakers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Matches a metric id in lib/strategy.ts's STRATEGY_METRICS. Stored as text
  -- rather than an enum so adding a metric doesn't need a migration; an id the
  -- code no longer knows is ignored at evaluation time.
  metric text not null,
  op text not null check (op in ('gte', 'lte')),
  -- In display units, the same as the screen builder: percentages as 15, not
  -- 0.15. Keeping one convention across both is what lets a rule be copied
  -- from one to the other without silently changing meaning by a factor of 100.
  value double precision not null,
  created_at timestamptz not null default now(),
  unique (user_id, metric, op, value)
);

alter table public.thesis_breakers enable row level security;

create policy "Users can view their own thesis breakers"
  on public.thesis_breakers for select
  using (auth.uid() = user_id);

create policy "Users can add their own thesis breakers"
  on public.thesis_breakers for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their own thesis breakers"
  on public.thesis_breakers for delete
  using (auth.uid() = user_id);

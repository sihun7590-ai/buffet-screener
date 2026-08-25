-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor → New query).
-- Stores which tickers a signed-in user has favorited, and the price at the
-- moment they did — that's what "% change since favorited" is measured against.

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  price_at_favorite double precision not null,
  favorited_at timestamptz not null default now(),
  unique (user_id, ticker)
);

alter table public.favorites enable row level security;

-- Row Level Security: every query (from the browser, from a Server
-- Component, from a future mobile app) is scoped to auth.uid() automatically,
-- so one user can never read or modify another user's favorites.
create policy "Users can view their own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "Users can add their own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);

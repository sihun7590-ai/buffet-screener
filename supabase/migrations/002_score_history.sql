-- Run once in the Supabase SQL Editor, after 001_favorites.sql.
--
-- One row per ticker per day. The screener keeps reading data/scores.json for
-- today's numbers; this table exists so that the past survives `npm run
-- refresh`, which overwrites that file. Score history, "score jumped" alerts
-- and backtesting all need yesterday to still be here.
--
-- Deliberately slim — the full per-criterion breakdown stays in scores.json,
-- so a year of daily snapshots of the whole S&P 500 lands in the tens of
-- megabytes rather than filling the free tier.

create table if not exists public.score_history (
  ticker text not null,
  as_of date not null,
  total double precision not null,
  quality double precision not null,
  growth double precision not null,
  health double precision not null,
  consistency double precision not null,
  valuation double precision not null,
  price double precision,
  margin_of_safety double precision,
  is_buy_candidate boolean not null default false,
  -- Which formula produced these numbers, so a chart can tell a step caused by
  -- the company apart from one caused by us changing how we measure.
  scoring_version integer not null,
  -- One snapshot per ticker per day: re-running the batch replaces the day's
  -- row instead of stacking duplicates.
  primary key (ticker, as_of)
);

-- "What did the whole market look like on this date" — the backtest's access
-- pattern, which a (ticker, as_of) primary key can't serve on its own.
create index if not exists score_history_as_of_idx on public.score_history (as_of);

alter table public.score_history enable row level security;

-- Scores are public data, so anyone may read them. There is deliberately no
-- insert/update/delete policy: the only writer is the refresh batch, which
-- connects with the service-role key and bypasses RLS. Without a policy, no
-- amount of anon-key access can forge a score.
drop policy if exists "Anyone can read score history" on public.score_history;
create policy "Anyone can read score history"
  on public.score_history for select
  using (true);

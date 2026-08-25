-- Run once in the Supabase SQL Editor, after 002_score_history.sql.
--
-- Two additions for reconstructed history:
--
-- `is_backfilled` marks a row the site never actually published — it's what
-- today's formula says about the data that was public on that date, computed
-- after the fact. Worth being able to say out loud on a chart rather than
-- passing it off as a score we stood behind at the time.
--
-- `criteria` carries the per-item breakdown (ROE, PEG, ...) so the chart can
-- answer "what was ROE back then", not just "what was the quality score".
-- Left null on the daily forward rows on purpose: every figure in it comes
-- from a filing, and filings change quarterly at most, so storing it daily
-- would be ~180MB a year of duplication. The quarterly backfill rows carry it,
-- and any date can be reconstructed again later if we want more detail.

alter table public.score_history
  add column if not exists is_backfilled boolean not null default false,
  add column if not exists criteria jsonb;

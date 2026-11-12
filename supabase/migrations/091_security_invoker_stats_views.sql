-- ============================================================================
-- 091: Stop the stats views from bypassing Row Level Security   (finding R1)
-- ============================================================================
-- season_position_stats and game_inning_validation (002) are owned by
-- `postgres`, which bypasses RLS. Without security_invoker, Postgres checks the
-- underlying tables' policies as the view OWNER, so any caller, including an
-- anonymous visitor using the public anon key, could read every team's player
-- names, jersey numbers and position stats through the REST API.
--
-- Fix: evaluate the views with the CALLER's permissions, so the existing RLS on
-- players / games / lineup_slots applies ("team access" policies: owner or
-- accepted coach). Anonymous visitors have no use for these views (the share
-- page uses the server-side service client), so their access is revoked too.
--
-- * No data is changed. View definitions and columns are unchanged.
-- * Requires Postgres 15+ (security_invoker). On older versions this fails
--   with an error and the transaction rolls back, changing nothing.
-- * Rollback (restores the vulnerable behaviour; only if this breaks something):
--     alter view public.season_position_stats  reset (security_invoker);
--     alter view public.game_inning_validation reset (security_invoker);
--     grant select on public.season_position_stats, public.game_inning_validation to anon;
-- ============================================================================

begin;

alter view public.season_position_stats  set (security_invoker = on);
alter view public.game_inning_validation set (security_invoker = on);

revoke all on public.season_position_stats  from anon;
revoke all on public.game_inning_validation from anon;

commit;

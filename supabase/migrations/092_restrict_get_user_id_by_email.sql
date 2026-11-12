-- ============================================================================
-- 092: Make get_user_id_by_email server-only   (finding R6)
-- ============================================================================
-- get_user_id_by_email (022) is SECURITY DEFINER and, through Postgres's default
-- PUBLIC execute grant, was callable by `anon` and `authenticated`. Anyone with
-- the public anon key could check whether an email has a Six43 account and get
-- its user id.
--
-- Its only callers are server routes that use the service-role client
-- (/api/invite/create, /api/tryouts/invite), so browsers never need it.
--
-- * No data or function body changes; only who may execute it.
-- * Rollback (restores the exposure):
--     grant execute on function public.get_user_id_by_email(text) to anon, authenticated;
-- ============================================================================

begin;

revoke execute on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant  execute on function public.get_user_id_by_email(text) to service_role;

commit;

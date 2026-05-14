-- ============================================================
-- Six43 – Migration 069: Add missing DELETE policy on tryout_seasons
-- ============================================================
-- Migration 031 created select/insert/update policies but no delete policy.
-- Without it, RLS silently blocks season deletion for all users.
-- ============================================================

create policy "tryout_seasons: admin can delete"
  on tryout_seasons for delete
  using (tryout_is_member(org_id, array['org_admin']));

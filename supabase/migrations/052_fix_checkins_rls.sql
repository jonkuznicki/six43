-- Migration 052: Fix tryout_checkins RLS to include org admin_user_id
--
-- The original write policy only checked tryout_org_members, but the org
-- creator is identified by tryout_orgs.admin_user_id and may not have a
-- member row. This caused "violates row-level security policy" on check-in.

drop policy if exists "tryout_checkins_admin_write" on tryout_checkins;

create policy "tryout_checkins_admin_write"
  on tryout_checkins for all
  using (
    exists (
      select 1 from tryout_sessions s
      join tryout_orgs o on o.id = s.org_id
      where s.id = tryout_checkins.session_id
        and (
          -- Org creator
          o.admin_user_id = auth.uid()
          or
          -- Any org_admin member
          exists (
            select 1 from tryout_org_members m
            where m.org_id = s.org_id
              and m.user_id = auth.uid()
              and m.is_active = true
              and m.role = 'org_admin'
          )
        )
    )
  );

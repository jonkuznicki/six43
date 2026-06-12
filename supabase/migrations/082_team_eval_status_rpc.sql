-- ============================================================
-- Migration 082: RPC for admins to view team eval draft statuses
-- ============================================================
-- Returns one row per team token for a given org+season,
-- left-joined with tryout_eval_drafts so teams with no draft
-- show status = 'not_started'.
-- Caller must be an authenticated org member or org creator.
-- ============================================================

create or replace function tryout_team_eval_statuses(
  p_org_id    uuid,
  p_season_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  if not exists (
    select 1 from tryout_org_members
    where org_id = p_org_id and user_id = auth.uid()
  ) and not exists (
    select 1 from tryout_orgs
    where id = p_org_id and admin_user_id = auth.uid()
  ) then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'team_label',    t.team_label,
          'status',        coalesce(d.status, 'not_started'),
          'coach_name',    d.coach_name,
          'opened_at',     d.opened_at,
          'last_saved_at', d.last_saved_at,
          'submitted_at',  d.submitted_at
        )
        order by t.team_label
      )
      from tryout_eval_team_tokens t
      left join tryout_eval_drafts d on d.token_id = t.id
      where t.org_id    = p_org_id
        and t.season_id = p_season_id
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function tryout_team_eval_statuses to authenticated;

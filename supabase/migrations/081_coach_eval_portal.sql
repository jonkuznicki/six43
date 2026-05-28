-- Public RPC for the coach evaluation portal landing page.
-- Returns org name, active season label, and all teams that have eval tokens.
-- Granted to anon so coaches can access without an account.

create or replace function tryout_coach_eval_portal(p_org_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_season_id    uuid;
  v_season_label text;
begin
  select id, label
    into v_season_id, v_season_label
    from tryout_seasons
   where org_id = p_org_id and is_active = true
   limit 1;

  return jsonb_build_object(
    'org_name',     (select name from tryout_orgs where id = p_org_id),
    'season_label', v_season_label,
    'teams', case when v_season_id is null then '[]'::jsonb else (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('team_label', t.team_label, 'token', t.token)
          order by t.team_label
        ),
        '[]'::jsonb
      )
      from tryout_eval_team_tokens t
      where t.org_id = p_org_id and t.season_id = v_season_id
    ) end
  );
end;
$$;

grant execute on function tryout_coach_eval_portal(uuid) to anon, authenticated;

-- Add org_name to tryout_eval_form_data_by_token so the public eval form
-- can display the organisation's name instead of Six43 branding.

create or replace function tryout_eval_form_data_by_token(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_season record;
  v_result jsonb;
begin
  select id, org_id, year into v_season
    from tryout_seasons
   where eval_share_token = p_token and is_active = true;

  if v_season.id is null then
    return jsonb_build_object('error', 'Invalid or expired link');
  end if;

  select jsonb_build_object(
    'org_name', (select name from tryout_orgs where id = v_season.org_id),
    'season', jsonb_build_object(
      'id',    v_season.id,
      'label', s.label,
      'year',  s.year
    ),
    'teams', (
      select coalesce(jsonb_agg(distinct p.prior_team order by p.prior_team), '[]')
        from tryout_players p
       where p.org_id    = v_season.org_id
         and p.is_active = true
         and p.prior_team is not null
    ),
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',         p.id,
        'first_name', p.first_name,
        'last_name',  p.last_name,
        'age_group',  p.age_group,
        'prior_team', p.prior_team
      ) order by p.last_name, p.first_name), '[]')
        from tryout_players p
       where p.org_id    = v_season.org_id
         and p.is_active = true
    ),
    'eval_config', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'field_key',   c.field_key,
        'label',       c.label,
        'section',     c.section,
        'is_optional', c.is_optional,
        'sort_order',  c.sort_order,
        'weight',      c.weight
      ) order by c.sort_order), '[]')
        from tryout_coach_eval_config c
       where c.org_id     = v_season.org_id
         and c.season_id  = v_season.id
    ),
    'submitted_player_ids', (
      select coalesce(jsonb_agg(e.player_id), '[]')
        from tryout_coach_evals e
       where e.org_id      = v_season.org_id
         and e.season_year = (v_season.year - 1)::text
         and e.status      = 'submitted'
    )
  )
  into v_result
  from tryout_seasons s
 where s.id = v_season.id;

  return v_result;
end;
$$;

grant execute on function tryout_eval_form_data_by_token to anon, authenticated;

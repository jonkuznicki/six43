-- Migration 036: Fix tryout_rankings_by_token — remove invalid jersey_number column
-- tryout_players has no jersey_number column; replace with prior_team only.

create or replace function tryout_rankings_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id    uuid;
  v_season_label text;
  v_result       jsonb;
begin
  select id, label into v_season_id, v_season_label
  from tryout_seasons
  where rankings_share_token = p_token;

  if v_season_id is null then
    return jsonb_build_object('error', 'Invalid or expired link');
  end if;

  select jsonb_build_object(
    'season', jsonb_build_object('id', v_season_id, 'label', v_season_label),
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
          'age_group', p.age_group, 'prior_team', p.prior_team
        ) order by p.last_name, p.first_name
      )
      from tryout_players p
      where p.org_id = (select org_id from tryout_seasons where id = v_season_id)
        and p.is_active = true
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', ts.player_id, 'tryout_score', ts.tryout_score
        )
      )
      from tryout_scores ts
      where ts.org_id = (select org_id from tryout_seasons where id = v_season_id)
    ), '[]'::jsonb),
    'evals', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', ce.player_id, 'scores', ce.scores
        )
      )
      from tryout_coach_evals ce
      where ce.org_id = (select org_id from tryout_seasons where id = v_season_id)
        and ce.status = 'submitted'
    ), '[]'::jsonb),
    'gc_stats', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', gs.player_id, 'ops', gs.ops, 'era', gs.era, 'whip', gs.whip,
          'avg', gs.avg, 'season_year', gs.season_year
        )
      )
      from tryout_gc_stats gs
      where gs.org_id = (select org_id from tryout_seasons where id = v_season_id)
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'player_id', ta.player_id, 'team_id', ta.team_id,
          'team_name', tt.name, 'team_color', tt.color
        )
      )
      from tryout_team_assignments ta
      join tryout_teams tt on tt.id = ta.team_id
      where ta.season_id = v_season_id
    ), '[]'::jsonb),
    'eval_config', coalesce((
      select jsonb_agg(
        jsonb_build_object('field_key', ec.field_key, 'label', ec.label)
        order by ec.sort_order
      )
      from tryout_coach_eval_config ec
      where ec.org_id = (select org_id from tryout_seasons where id = v_season_id)
        and ec.season_id = v_season_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function tryout_rankings_by_token(uuid) to anon, authenticated;

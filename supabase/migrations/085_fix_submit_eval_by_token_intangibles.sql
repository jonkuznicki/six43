-- Fix tryout_submit_eval_by_token to compute and persist intangibles_score
-- and coach_eval_score (same as the team-token path does in migration 077).
-- The original function in migration 037 only saved raw scores with no computed fields.

drop function if exists tryout_submit_eval_by_token(uuid, text, text, jsonb);

create function tryout_submit_eval_by_token(
  p_token         uuid,
  p_team_label    text,
  p_coach_name    text,
  p_player_scores jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id    uuid;
  v_season_year  text;
  v_org_id       uuid;
  v_player_id    uuid;
  v_scores       jsonb;
  v_computed     numeric;
  v_eval_score   numeric;
  v_intangibles  numeric;
  v_count        int := 0;
begin
  select id, (year - 1)::text, org_id
    into v_season_id, v_season_year, v_org_id
    from tryout_seasons
   where eval_share_token = p_token;

  if v_season_id is null then
    return jsonb_build_object('error', 'Invalid or expired link');
  end if;

  if p_coach_name is null or trim(p_coach_name) = '' then
    return jsonb_build_object('error', 'Coach name is required');
  end if;

  if p_team_label is null or trim(p_team_label) = '' then
    return jsonb_build_object('error', 'Team selection is required');
  end if;

  for v_player_id, v_scores in
    select key::uuid, value
      from jsonb_each(p_player_scores)
  loop
    if not exists (
      select 1 from tryout_players
       where id = v_player_id and org_id = v_org_id
    ) then
      continue;
    end if;

    -- Weighted avg of ALL scored fields with weight > 0
    select case when sum(cfg.weight) = 0 then null
                else round(sum((v_scores ->> cfg.field_key)::numeric * cfg.weight) / sum(cfg.weight), 2)
           end
      into v_computed
      from tryout_coach_eval_config cfg
     where cfg.org_id    = v_org_id
       and cfg.season_id = v_season_id
       and cfg.weight    > 0
       and v_scores ? cfg.field_key
       and (v_scores ->> cfg.field_key) ~ '^[0-9]+(\.[0-9]+)?$';

    -- Weighted avg of non-intangibles fields only
    select case when sum(cfg.weight) = 0 then null
                else round(sum((v_scores ->> cfg.field_key)::numeric * cfg.weight) / sum(cfg.weight), 2)
           end
      into v_eval_score
      from tryout_coach_eval_config cfg
     where cfg.org_id    = v_org_id
       and cfg.season_id = v_season_id
       and cfg.section  != 'intangibles'
       and cfg.weight    > 0
       and v_scores ? cfg.field_key
       and (v_scores ->> cfg.field_key) ~ '^[0-9]+(\.[0-9]+)?$';

    -- Weighted avg of intangibles section only
    select case when sum(cfg.weight) = 0 then null
                else round(sum((v_scores ->> cfg.field_key)::numeric * cfg.weight) / sum(cfg.weight), 2)
           end
      into v_intangibles
      from tryout_coach_eval_config cfg
     where cfg.org_id    = v_org_id
       and cfg.season_id = v_season_id
       and cfg.section   = 'intangibles'
       and cfg.weight    > 0
       and v_scores ? cfg.field_key
       and (v_scores ->> cfg.field_key) ~ '^[0-9]+(\.[0-9]+)?$';

    insert into tryout_coach_evals (
      player_id, org_id, season_id, season_year,
      team_label, coach_name, scores, status, submitted_at,
      computed_score, coach_eval_score, intangibles_score
    ) values (
      v_player_id, v_org_id, v_season_id, v_season_year,
      trim(p_team_label), trim(p_coach_name), v_scores, 'submitted', now(),
      v_computed, v_eval_score, v_intangibles
    )
    on conflict (player_id, org_id, season_year) do update set
      scores            = excluded.scores,
      coach_name        = excluded.coach_name,
      team_label        = excluded.team_label,
      season_id         = excluded.season_id,
      status            = 'submitted',
      submitted_at      = now(),
      updated_at        = now(),
      computed_score    = excluded.computed_score,
      coach_eval_score  = excluded.coach_eval_score,
      intangibles_score = excluded.intangibles_score;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('submitted', v_count, 'team', p_team_label);
end;
$$;

grant execute on function tryout_submit_eval_by_token(uuid, text, text, jsonb) to anon, authenticated;

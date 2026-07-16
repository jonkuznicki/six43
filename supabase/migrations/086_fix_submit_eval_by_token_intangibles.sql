-- Migration 085 created a 4-arg overload of tryout_submit_eval_by_token that never
-- gets called (the coach form passes all 7 args and Postgres resolves to the 7-arg
-- canonical from migration 042).  Clean up the orphan and replace the 7-arg function
-- so it also computes and persists intangibles_score.

-- Drop the 4-arg orphan created by migration 085
drop function if exists tryout_submit_eval_by_token(uuid, text, text, jsonb);

-- Replace the 7-arg canonical to add intangibles_score computation
create or replace function tryout_submit_eval_by_token(
  p_token           uuid,
  p_team_label      text,
  p_coach_name      text,
  p_player_scores   jsonb,
  p_player_comments jsonb  default '{}',
  p_overall_notes   text   default null,
  p_contact_email   text   default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_season        record;
  v_pid           uuid;
  v_scores        jsonb;
  v_comment       text;
  v_computed      numeric;
  v_intangibles   numeric;
  v_count         int := 0;
  v_all_ids       uuid[];
begin
  select id, org_id, year into v_season
    from tryout_seasons
   where eval_share_token = p_token and is_active = true;

  if v_season.id is null then
    return jsonb_build_object('error', 'Invalid or expired token');
  end if;

  select array_agg(distinct k::uuid)
    into v_all_ids
    from (
      select key as k from jsonb_each(coalesce(p_player_scores,   '{}'))
      union
      select key as k from jsonb_each(coalesce(p_player_comments, '{}'))
    ) t;

  foreach v_pid in array coalesce(v_all_ids, '{}')
  loop
    v_scores  := coalesce(p_player_scores   -> v_pid::text, '{}');
    v_comment := coalesce(p_player_comments ->> v_pid::text, null);

    -- Overall weighted average (all sections, weight > 0)
    select case when sum(cfg.weight) = 0 then null
                else round(sum((v_scores ->> cfg.field_key)::numeric * cfg.weight)
                           / sum(cfg.weight), 2)
           end
      into v_computed
      from tryout_coach_eval_config cfg
     where cfg.org_id    = v_season.org_id
       and cfg.season_id = v_season.id
       and cfg.weight    > 0
       and v_scores ? cfg.field_key
       and (v_scores ->> cfg.field_key) ~ '^[0-9]+(\.[0-9]+)?$';

    -- Simple average of intangibles section (matches client-side sectionAvg)
    select case when count(*) = 0 then null
                else round(avg((v_scores ->> cfg.field_key)::numeric), 2)
           end
      into v_intangibles
      from tryout_coach_eval_config cfg
     where cfg.org_id    = v_season.org_id
       and cfg.season_id = v_season.id
       and cfg.section   = 'intangibles'
       and v_scores ? cfg.field_key
       and (v_scores ->> cfg.field_key) ~ '^[0-9]+(\.[0-9]+)?$';

    insert into tryout_coach_evals (
      player_id, org_id, season_id, season_year, team_label, coach_name,
      status, scores, comments, computed_score, intangibles_score, submitted_at
    ) values (
      v_pid, v_season.org_id, v_season.id, (v_season.year - 1)::text,
      p_team_label, p_coach_name,
      'submitted', v_scores, v_comment, v_computed, v_intangibles, now()
    )
    on conflict (player_id, org_id, season_year) do update set
      team_label        = excluded.team_label,
      coach_name        = excluded.coach_name,
      season_id         = excluded.season_id,
      status            = 'submitted',
      scores            = excluded.scores,
      comments          = excluded.comments,
      computed_score    = excluded.computed_score,
      intangibles_score = excluded.intangibles_score,
      submitted_at      = excluded.submitted_at;

    v_count := v_count + 1;
  end loop;

  insert into tryout_coach_eval_submissions (
    org_id, season_year, team_label, coach_name, overall_notes, contact_email
  ) values (
    v_season.org_id, (v_season.year - 1)::text,
    p_team_label, p_coach_name, p_overall_notes, p_contact_email
  )
  on conflict (org_id, season_year, team_label) do update set
    coach_name    = excluded.coach_name,
    overall_notes = excluded.overall_notes,
    contact_email = coalesce(excluded.contact_email, tryout_coach_eval_submissions.contact_email),
    submitted_at  = excluded.submitted_at;

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

grant execute on function tryout_submit_eval_by_token to anon, authenticated;

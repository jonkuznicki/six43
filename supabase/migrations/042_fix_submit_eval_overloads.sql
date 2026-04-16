-- Fix: tryout_submit_eval_by_token has multiple overloaded signatures from
-- migrations 037, 040, and 041.  DROP all variants explicitly, then
-- re-create the canonical final version (from 041) so there is exactly one.

drop function if exists tryout_submit_eval_by_token(uuid, text, text, jsonb);
drop function if exists tryout_submit_eval_by_token(uuid, text, text, jsonb, jsonb, text, text);

-- Final version: weighted computed_score + per-player comments + submission record
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
  v_season      record;
  v_pid         uuid;
  v_scores      jsonb;
  v_comment     text;
  v_computed    numeric;
  v_count       int := 0;
  v_all_ids     uuid[];
begin
  select id, org_id, year into v_season
    from tryout_seasons
   where eval_share_token = p_token and is_active = true;

  if v_season.id is null then
    return jsonb_build_object('error', 'Invalid or expired token');
  end if;

  -- Collect all player IDs referenced in scores or comments
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

    -- Weighted average of scored fields where weight > 0
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

    insert into tryout_coach_evals (
      player_id, org_id, season_year, team_label, coach_name,
      status, scores, comments, computed_score, submitted_at
    ) values (
      v_pid, v_season.org_id, (v_season.year - 1)::text,
      p_team_label, p_coach_name,
      'submitted', v_scores, v_comment, v_computed, now()
    )
    on conflict (player_id, org_id, season_year) do update set
      team_label     = excluded.team_label,
      coach_name     = excluded.coach_name,
      status         = 'submitted',
      scores         = excluded.scores,
      comments       = excluded.comments,
      computed_score = excluded.computed_score,
      submitted_at   = excluded.submitted_at;

    v_count := v_count + 1;
  end loop;

  -- Upsert overall submission record
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

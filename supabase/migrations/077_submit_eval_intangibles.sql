-- Migration 077: compute and persist intangibles_score + coach_eval_score
-- on submit via the token-based coach form.
--
-- Previously tryout_submit_eval_by_team_token only saved computed_score
-- (weighted avg of ALL fields). This version also computes:
--   intangibles_score  — weighted avg of section = 'intangibles' fields
--   coach_eval_score   — weighted avg of all non-intangibles fields
-- Both are saved to tryout_coach_evals so the team-making page can show them.

drop function if exists tryout_submit_eval_by_team_token(uuid, text, jsonb);
drop function if exists tryout_submit_eval_by_team_token(uuid, text, jsonb, jsonb);
drop function if exists tryout_submit_eval_by_team_token(uuid, text, jsonb, jsonb, text);
drop function if exists tryout_submit_eval_by_team_token(uuid, text, jsonb, jsonb, text, text);

create function tryout_submit_eval_by_team_token(
  p_token           uuid,
  p_coach_name      text,
  p_player_scores   jsonb,
  p_player_comments jsonb default '{}',
  p_overall_notes   text  default null,
  p_contact_email   text  default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_rec          record;
  v_pid          uuid;
  v_scores       jsonb;
  v_comment      text;
  v_computed     numeric;
  v_eval_score   numeric;
  v_intangibles  numeric;
  v_count        int := 0;
  v_all_ids      uuid[];
begin
  select t.id as token_id, t.org_id, t.season_id, t.team_label, s.year
    into v_rec
    from tryout_eval_team_tokens t
    join tryout_seasons s on s.id = t.season_id
   where t.token = p_token;

  if not found then
    return jsonb_build_object('error', 'Invalid or expired token');
  end if;

  select array_agg(distinct k::uuid) into v_all_ids
  from (
    select key as k from jsonb_each(coalesce(p_player_scores, '{}'))
    union
    select key as k from jsonb_each(coalesce(p_player_comments, '{}'))
  ) sub;

  foreach v_pid in array coalesce(v_all_ids, '{}')
  loop
    v_scores  := coalesce(p_player_scores   -> v_pid::text, '{}');
    v_comment := coalesce(p_player_comments ->> v_pid::text, null);

    -- Weighted avg of ALL scored fields (weight > 0)
    select case when sum(cfg.weight) = 0 then null
                else round(sum((v_scores ->> cfg.field_key)::numeric * cfg.weight) / sum(cfg.weight), 2)
           end
      into v_computed
      from tryout_coach_eval_config cfg
     where cfg.org_id    = v_rec.org_id
       and cfg.season_id = v_rec.season_id
       and cfg.weight    > 0
       and v_scores ? cfg.field_key
       and (v_scores ->> cfg.field_key) ~ '^[0-9]+(\.[0-9]+)?$';

    -- Weighted avg of non-intangibles fields only
    select case when sum(cfg.weight) = 0 then null
                else round(sum((v_scores ->> cfg.field_key)::numeric * cfg.weight) / sum(cfg.weight), 2)
           end
      into v_eval_score
      from tryout_coach_eval_config cfg
     where cfg.org_id    = v_rec.org_id
       and cfg.season_id = v_rec.season_id
       and cfg.section  != 'intangibles'
       and cfg.weight    > 0
       and v_scores ? cfg.field_key
       and (v_scores ->> cfg.field_key) ~ '^[0-9]+(\.[0-9]+)?$';

    -- Weighted avg of intangibles fields only
    select case when sum(cfg.weight) = 0 then null
                else round(sum((v_scores ->> cfg.field_key)::numeric * cfg.weight) / sum(cfg.weight), 2)
           end
      into v_intangibles
      from tryout_coach_eval_config cfg
     where cfg.org_id    = v_rec.org_id
       and cfg.season_id = v_rec.season_id
       and cfg.section   = 'intangibles'
       and cfg.weight    > 0
       and v_scores ? cfg.field_key
       and (v_scores ->> cfg.field_key) ~ '^[0-9]+(\.[0-9]+)?$';

    insert into tryout_coach_evals (
      player_id, org_id, season_year, season_id, team_label, coach_name,
      status, scores, comments, computed_score, coach_eval_score, intangibles_score
    ) values (
      v_pid, v_rec.org_id, (v_rec.year - 1)::text, v_rec.season_id,
      v_rec.team_label, p_coach_name,
      'submitted', v_scores, v_comment, v_computed, v_eval_score, v_intangibles
    )
    on conflict (player_id, org_id, season_year) do update set
      team_label        = excluded.team_label,
      coach_name        = excluded.coach_name,
      season_id         = excluded.season_id,
      status            = 'submitted',
      scores            = excluded.scores,
      comments          = excluded.comments,
      computed_score    = excluded.computed_score,
      coach_eval_score  = excluded.coach_eval_score,
      intangibles_score = excluded.intangibles_score,
      submitted_at      = now();

    v_count := v_count + 1;
  end loop;

  insert into tryout_coach_eval_submissions (
    org_id, season_year, team_label, coach_name, overall_notes, contact_email
  ) values (
    v_rec.org_id, (v_rec.year - 1)::text,
    v_rec.team_label, p_coach_name, p_overall_notes, p_contact_email
  )
  on conflict (org_id, season_year, team_label) do update set
    coach_name    = excluded.coach_name,
    overall_notes = coalesce(excluded.overall_notes, tryout_coach_eval_submissions.overall_notes),
    contact_email = coalesce(excluded.contact_email, tryout_coach_eval_submissions.contact_email),
    submitted_at  = now();

  insert into tryout_eval_drafts (
    token_id, org_id, season_id, team_label,
    coach_name, scores, comments, overall_notes,
    status, opened_at, last_saved_at, submitted_at
  ) values (
    v_rec.token_id, v_rec.org_id, v_rec.season_id, v_rec.team_label,
    p_coach_name,
    coalesce(p_player_scores, '{}'),
    coalesce(p_player_comments, '{}'),
    p_overall_notes,
    'submitted', now(), now(), now()
  )
  on conflict (token_id) do update set
    coach_name    = excluded.coach_name,
    scores        = excluded.scores,
    comments      = excluded.comments,
    overall_notes = coalesce(excluded.overall_notes, tryout_eval_drafts.overall_notes),
    status        = 'submitted',
    last_saved_at = now(),
    submitted_at  = now();

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

grant execute on function tryout_submit_eval_by_team_token to anon, authenticated;

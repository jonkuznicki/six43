-- Ensure weight columns exist (idempotent — safe to run if 041 was skipped).
alter table tryout_coach_eval_config
  add column if not exists weight numeric not null default 1.0;

alter table tryout_coach_evals
  add column if not exists computed_score numeric;

-- Draft-save RPC: identical logic to tryout_submit_eval_by_token
-- but stores status = 'draft' and never overwrites a submitted record.
-- Called by the public eval form when a coach clicks "Save Progress".
create or replace function tryout_save_eval_draft_by_token(
  p_token           uuid,
  p_team_label      text,
  p_coach_name      text,
  p_player_scores   jsonb,
  p_player_comments jsonb  default '{}',
  p_contact_email   text   default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_season  record;
  v_pid     uuid;
  v_scores  jsonb;
  v_comment text;
  v_computed numeric;
  v_count   int := 0;
  v_all_ids uuid[];
begin
  select id, org_id, year into v_season
    from tryout_seasons
   where eval_share_token = p_token and is_active = true;

  if v_season.id is null then
    return jsonb_build_object('error', 'Invalid or expired token');
  end if;

  select array_agg(distinct k::uuid) into v_all_ids
    from (
      select key as k from jsonb_each(coalesce(p_player_scores, '{}'))
      union
      select key as k from jsonb_each(coalesce(p_player_comments, '{}'))
    ) t;

  foreach v_pid in array coalesce(v_all_ids, '{}')
  loop
    v_scores  := coalesce(p_player_scores   -> v_pid::text, '{}');
    v_comment := coalesce(p_player_comments ->> v_pid::text, null);

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
      status, scores, comments, computed_score
    ) values (
      v_pid, v_season.org_id, (v_season.year - 1)::text,
      p_team_label, p_coach_name,
      'draft', v_scores, v_comment, v_computed
    )
    on conflict (player_id, org_id, season_year) do update set
      team_label     = excluded.team_label,
      coach_name     = excluded.coach_name,
      -- never overwrite a submitted record
      status         = case when tryout_coach_evals.status = 'submitted'
                            then 'submitted' else 'draft' end,
      scores         = case when tryout_coach_evals.status = 'submitted'
                            then tryout_coach_evals.scores else excluded.scores end,
      comments       = case when tryout_coach_evals.status = 'submitted'
                            then tryout_coach_evals.comments else excluded.comments end,
      computed_score = case when tryout_coach_evals.status = 'submitted'
                            then tryout_coach_evals.computed_score else excluded.computed_score end;

    v_count := v_count + 1;
  end loop;

  -- Optionally record contact info for resume
  if p_contact_email is not null then
    insert into tryout_coach_eval_submissions (
      org_id, season_year, team_label, coach_name, contact_email
    ) values (
      v_season.org_id, (v_season.year - 1)::text,
      p_team_label, p_coach_name, p_contact_email
    )
    on conflict (org_id, season_year, team_label) do update set
      coach_name    = excluded.coach_name,
      contact_email = coalesce(excluded.contact_email, tryout_coach_eval_submissions.contact_email);
  end if;

  return jsonb_build_object('ok', true, 'count', v_count, 'status', 'draft');
end;
$$;

grant execute on function tryout_save_eval_draft_by_token to anon, authenticated;

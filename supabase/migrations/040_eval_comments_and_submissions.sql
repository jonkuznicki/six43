-- Coach eval: per-submission records (overall notes + contact email)
-- and updated submit function to accept per-player comments.

-- 1. Submission record — one per team per season, holds overall notes + contact email
create table if not exists tryout_coach_eval_submissions (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null,
  season_year   text        not null,
  team_label    text        not null,
  coach_name    text,
  overall_notes text,
  contact_email text,
  submitted_at  timestamptz not null default now(),
  unique (org_id, season_year, team_label)
);

alter table tryout_coach_eval_submissions enable row level security;

create policy "eval_submissions_member" on tryout_coach_eval_submissions
  for all using (tryout_is_member(org_id, array['org_admin', 'head_coach']));

-- 2. Updated submit function — adds p_player_comments, p_overall_notes, p_contact_email
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
  v_season    record;
  v_pid       uuid;
  v_scores    jsonb;
  v_comment   text;
  v_count     int := 0;
  v_all_ids   uuid[];
begin
  select id, org_id, year into v_season
    from tryout_seasons
   where eval_share_token = p_token and is_active = true;

  if v_season.id is null then
    return jsonb_build_object('error', 'Invalid or expired token');
  end if;

  -- Collect all referenced player IDs (from scores and comments)
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

    insert into tryout_coach_evals (
      player_id, org_id, season_year, team_label, coach_name,
      status, scores, comments, submitted_at
    ) values (
      v_pid, v_season.org_id, (v_season.year - 1)::text,
      p_team_label, p_coach_name,
      'submitted', v_scores, v_comment, now()
    )
    on conflict (player_id, org_id, season_year) do update set
      team_label   = excluded.team_label,
      coach_name   = excluded.coach_name,
      status       = 'submitted',
      scores       = excluded.scores,
      comments     = excluded.comments,
      submitted_at = excluded.submitted_at;

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

-- 3. Save contact email post-submission (optional, called after the submit step)
create or replace function tryout_eval_save_contact(
  p_token      uuid,
  p_team_label text,
  p_email      text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_season record;
begin
  select id, org_id, year into v_season
    from tryout_seasons
   where eval_share_token = p_token and is_active = true;

  if v_season.id is null then
    return jsonb_build_object('error', 'Invalid token');
  end if;

  update tryout_coach_eval_submissions
     set contact_email = p_email
   where org_id     = v_season.org_id
     and season_year = (v_season.year - 1)::text
     and team_label  = p_team_label;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function tryout_eval_save_contact to anon, authenticated;

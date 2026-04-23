-- ============================================================
-- Migration 059: Fix ambiguous function signatures from 058
-- ============================================================
-- DROP the old versions of all three eval RPCs so CREATE OR REPLACE
-- in 058 would have worked cleanly. Since 058 may have partially
-- applied (table created, functions failed), we redo all three here.
-- ============================================================

-- ── Ensure draft table exists (idempotent) ────────────────────────────────────

create table if not exists tryout_eval_drafts (
  id            uuid        primary key default gen_random_uuid(),
  token_id      uuid        not null references tryout_eval_team_tokens(id) on delete cascade,
  org_id        uuid        not null,
  season_id     uuid        not null,
  team_label    text        not null,
  coach_name    text,
  scores        jsonb       not null default '{}',
  comments      jsonb       not null default '{}',
  overall_notes text,
  status        text        not null default 'in_progress',
  opened_at     timestamptz not null default now(),
  last_saved_at timestamptz,
  submitted_at  timestamptz,
  constraint tryout_eval_drafts_token_unique unique (token_id)
);

alter table tryout_eval_drafts enable row level security;

-- ── Drop all existing overloads so CREATE OR REPLACE is unambiguous ───────────

drop function if exists tryout_save_eval_draft_by_team_token(uuid, text, jsonb);
drop function if exists tryout_save_eval_draft_by_team_token(uuid, text, jsonb, jsonb);
drop function if exists tryout_save_eval_draft_by_team_token(uuid, text, jsonb, jsonb, text);
drop function if exists tryout_save_eval_draft_by_team_token(uuid, text, jsonb, jsonb, text, text);

drop function if exists tryout_eval_form_data_by_team_token(uuid);

drop function if exists tryout_submit_eval_by_team_token(uuid, text, jsonb);
drop function if exists tryout_submit_eval_by_team_token(uuid, text, jsonb, jsonb);
drop function if exists tryout_submit_eval_by_team_token(uuid, text, jsonb, jsonb, text);
drop function if exists tryout_submit_eval_by_team_token(uuid, text, jsonb, jsonb, text, text);

-- ── Save-draft function ───────────────────────────────────────────────────────

create function tryout_save_eval_draft_by_team_token(
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
  v_rec record;
begin
  select t.id as token_id, t.org_id, t.season_id, t.team_label
    into v_rec
    from tryout_eval_team_tokens t
   where t.token = p_token;

  if not found then
    return jsonb_build_object('error', 'Invalid or expired token');
  end if;

  insert into tryout_eval_drafts (
    token_id, org_id, season_id, team_label,
    coach_name, scores, comments, overall_notes,
    status, opened_at, last_saved_at
  ) values (
    v_rec.token_id, v_rec.org_id, v_rec.season_id, v_rec.team_label,
    p_coach_name,
    coalesce(p_player_scores,   '{}'),
    coalesce(p_player_comments, '{}'),
    p_overall_notes,
    'in_progress', now(), now()
  )
  on conflict (token_id) do update set
    coach_name    = excluded.coach_name,
    scores        = excluded.scores,
    comments      = excluded.comments,
    overall_notes = coalesce(excluded.overall_notes, tryout_eval_drafts.overall_notes),
    last_saved_at = now()
  where tryout_eval_drafts.status != 'submitted';

  return jsonb_build_object('ok', true, 'status', 'in_progress');
end;
$$;

-- ── Form-data function (includes server draft) ────────────────────────────────

create function tryout_eval_form_data_by_team_token(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_rec record;
begin
  select t.id as token_id, t.org_id, t.season_id, t.team_label, s.year
    into v_rec
    from tryout_eval_team_tokens t
    join tryout_seasons s on s.id = t.season_id
   where t.token = p_token;

  if not found then
    return jsonb_build_object('error', 'Invalid or expired link');
  end if;

  return (
    select jsonb_build_object(
      'org_name',      (select name from tryout_orgs where id = v_rec.org_id),
      'selected_team', v_rec.team_label,
      'season',        jsonb_build_object('id', s.id, 'label', s.label, 'year', s.year),
      'players', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
          'age_group', p.age_group, 'prior_team', p.prior_team
        ) order by p.last_name, p.first_name), '[]')
        from tryout_players p
        where p.org_id = v_rec.org_id and p.prior_team = v_rec.team_label and p.is_active = true
      ),
      'eval_config', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'field_key', c.field_key, 'label', c.label, 'section', c.section,
          'is_optional', c.is_optional, 'sort_order', c.sort_order, 'weight', c.weight
        ) order by c.sort_order), '[]')
        from tryout_coach_eval_config c
        where c.org_id = v_rec.org_id and c.season_id = v_rec.season_id
      ),
      'submitted_player_ids', (
        select coalesce(jsonb_agg(e.player_id), '[]')
        from tryout_coach_evals e
        where e.org_id      = v_rec.org_id
          and e.season_year = (v_rec.year - 1)::text
          and e.status      = 'submitted'
          and e.team_label  = v_rec.team_label
      ),
      'draft', (
        select jsonb_build_object(
          'coach_name',    d.coach_name,
          'scores',        d.scores,
          'comments',      d.comments,
          'overall_notes', d.overall_notes,
          'status',        d.status,
          'last_saved_at', d.last_saved_at,
          'submitted_at',  d.submitted_at
        )
        from tryout_eval_drafts d
        where d.token_id = v_rec.token_id
      )
    )
    from tryout_seasons s where s.id = v_rec.season_id
  );
end;
$$;

-- ── Submit function (marks draft as submitted) ────────────────────────────────

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
  v_rec      record;
  v_pid      uuid;
  v_scores   jsonb;
  v_comment  text;
  v_computed numeric;
  v_count    int := 0;
  v_all_ids  uuid[];
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

    insert into tryout_coach_evals (
      player_id, org_id, season_year, team_label, coach_name,
      status, scores, comments, computed_score
    ) values (
      v_pid, v_rec.org_id, (v_rec.year - 1)::text,
      v_rec.team_label, p_coach_name,
      'submitted', v_scores, v_comment, v_computed
    )
    on conflict (player_id, org_id, season_year) do update set
      team_label     = excluded.team_label,
      coach_name     = excluded.coach_name,
      status         = 'submitted',
      scores         = excluded.scores,
      comments       = excluded.comments,
      computed_score = excluded.computed_score,
      submitted_at   = now();

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

-- ── Grants ────────────────────────────────────────────────────────────────────

grant execute on function tryout_save_eval_draft_by_team_token  to anon, authenticated;
grant execute on function tryout_eval_form_data_by_team_token   to anon, authenticated;
grant execute on function tryout_submit_eval_by_team_token      to anon, authenticated;

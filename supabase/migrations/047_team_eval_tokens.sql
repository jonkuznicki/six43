-- Per-team evaluation tokens.
-- Each team gets a unique shareable link. Coaches visit their team's link,
-- enter their name, and score players — no account needed, works across devices.

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists tryout_eval_team_tokens (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null,
  season_id  uuid        not null,
  team_label text        not null,
  token      uuid        not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  constraint tryout_eval_team_tokens_token_unique  unique (token),
  constraint tryout_eval_team_tokens_team_unique   unique (org_id, season_id, team_label)
);

alter table tryout_eval_team_tokens enable row level security;

-- Admins and head coaches can read/manage tokens for their org
drop policy if exists "eval_team_tokens_admin" on tryout_eval_team_tokens;
create policy "eval_team_tokens_admin" on tryout_eval_team_tokens
  for all using (
    tryout_is_member(org_id, array['org_admin','head_coach'])
    or exists(select 1 from tryout_orgs where id = org_id and admin_user_id = auth.uid())
  );

-- ── Generate (or return existing) token for a team ───────────────────────────

create or replace function tryout_upsert_team_eval_token(
  p_org_id    uuid,
  p_season_id uuid,
  p_team_label text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_token uuid;
begin
  if not (
    tryout_is_member(p_org_id, array['org_admin','head_coach'])
    or exists(select 1 from tryout_orgs where id = p_org_id and admin_user_id = auth.uid())
  ) then
    raise exception 'Not authorized';
  end if;

  insert into tryout_eval_team_tokens (org_id, season_id, team_label)
  values (p_org_id, p_season_id, p_team_label)
  on conflict (org_id, season_id, team_label) do nothing;

  select token into v_token
    from tryout_eval_team_tokens
   where org_id = p_org_id and season_id = p_season_id and team_label = p_team_label;

  return v_token;
end;
$$;

-- ── Regenerate token (issues new UUID, old link stops working) ────────────────

create or replace function tryout_regenerate_team_eval_token(
  p_org_id    uuid,
  p_season_id uuid,
  p_team_label text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_new uuid := gen_random_uuid();
begin
  if not (
    tryout_is_member(p_org_id, array['org_admin','head_coach'])
    or exists(select 1 from tryout_orgs where id = p_org_id and admin_user_id = auth.uid())
  ) then
    raise exception 'Not authorized';
  end if;

  update tryout_eval_team_tokens
     set token = v_new, created_at = now()
   where org_id = p_org_id and season_id = p_season_id and team_label = p_team_label;

  if not found then
    insert into tryout_eval_team_tokens (org_id, season_id, team_label, token)
    values (p_org_id, p_season_id, p_team_label, v_new);
  end if;

  return v_new;
end;
$$;

-- ── Form data for team token ──────────────────────────────────────────────────

create or replace function tryout_eval_form_data_by_team_token(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_rec record;
begin
  select t.org_id, t.season_id, t.team_label, s.year
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
      )
    )
    from tryout_seasons s where s.id = v_rec.season_id
  );
end;
$$;

-- ── Submit via team token ─────────────────────────────────────────────────────

create or replace function tryout_submit_eval_by_team_token(
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
  select t.org_id, t.season_id, t.team_label, s.year
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

  return jsonb_build_object('ok', true, 'count', v_count);
end;
$$;

-- ── Draft save via team token ─────────────────────────────────────────────────

create or replace function tryout_save_eval_draft_by_team_token(
  p_token           uuid,
  p_coach_name      text,
  p_player_scores   jsonb,
  p_player_comments jsonb default '{}',
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
  select t.org_id, t.season_id, t.team_label, s.year
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
      'draft', v_scores, v_comment, v_computed
    )
    on conflict (player_id, org_id, season_year) do update set
      team_label     = excluded.team_label,
      coach_name     = excluded.coach_name,
      status         = case when tryout_coach_evals.status = 'submitted' then 'submitted' else 'draft' end,
      scores         = case when tryout_coach_evals.status = 'submitted' then tryout_coach_evals.scores else excluded.scores end,
      comments       = case when tryout_coach_evals.status = 'submitted' then tryout_coach_evals.comments else excluded.comments end,
      computed_score = case when tryout_coach_evals.status = 'submitted' then tryout_coach_evals.computed_score else excluded.computed_score end;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'count', v_count, 'status', 'draft');
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────

grant execute on function tryout_upsert_team_eval_token         to authenticated;
grant execute on function tryout_regenerate_team_eval_token      to authenticated;
grant execute on function tryout_eval_form_data_by_team_token    to anon, authenticated;
grant execute on function tryout_submit_eval_by_team_token       to anon, authenticated;
grant execute on function tryout_save_eval_draft_by_team_token   to anon, authenticated;

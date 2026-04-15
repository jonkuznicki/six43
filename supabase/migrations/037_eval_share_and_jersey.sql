-- Migration 037: Eval share token + jersey_number on players
-- Adds jersey_number to tryout_players (populated by roster import),
-- eval_share_token to tryout_seasons, and two security-definer RPCs for
-- the public coach eval form (no auth required).

-- ── Schema additions ──────────────────────────────────────────────────────────

alter table tryout_players
  add column if not exists jersey_number text;

alter table tryout_seasons
  add column if not exists eval_share_token uuid unique default null;

create index if not exists idx_tryout_seasons_eval_token
  on tryout_seasons(eval_share_token)
  where eval_share_token is not null;

-- ── RPC: fetch public eval form data ─────────────────────────────────────────

create or replace function tryout_eval_form_data_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id    uuid;
  v_season_label text;
  v_season_year  int;
  v_org_id       uuid;
  v_result       jsonb;
begin
  select id, label, year, org_id
  into v_season_id, v_season_label, v_season_year, v_org_id
  from tryout_seasons
  where eval_share_token = p_token;

  if v_season_id is null then
    return jsonb_build_object('error', 'Invalid or expired link');
  end if;

  select jsonb_build_object(
    'season', jsonb_build_object(
      'id',    v_season_id,
      'label', v_season_label,
      'year',  v_season_year
    ),
    -- Distinct prior_team values that have players — used for team dropdown
    'teams', coalesce((
      select jsonb_agg(t order by t)
      from (
        select distinct prior_team as t
        from tryout_players
        where org_id = v_org_id
          and is_active = true
          and prior_team is not null
          and prior_team <> ''
      ) sub
    ), '[]'::jsonb),
    -- Players: only id, name, age_group, prior_team — no contact info
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',         p.id,
          'first_name', p.first_name,
          'last_name',  p.last_name,
          'age_group',  p.age_group,
          'prior_team', p.prior_team
        ) order by p.prior_team, p.last_name, p.first_name
      )
      from tryout_players p
      where p.org_id = v_org_id
        and p.is_active = true
        and p.prior_team is not null
        and p.prior_team <> ''
    ), '[]'::jsonb),
    -- Eval rubric fields for this season
    'eval_config', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'field_key',   ec.field_key,
          'label',       ec.label,
          'section',     ec.section,
          'is_optional', ec.is_optional,
          'sort_order',  ec.sort_order
        ) order by ec.sort_order
      )
      from tryout_coach_eval_config ec
      where ec.org_id = v_org_id
        and ec.season_id = v_season_id
    ), '[]'::jsonb),
    -- Already-submitted evals for this season (so form can show status)
    'submitted_player_ids', coalesce((
      select jsonb_agg(player_id)
      from tryout_coach_evals
      where org_id    = v_org_id
        and season_id = v_season_id
        and status    = 'submitted'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ── RPC: submit coach eval (public, no auth) ──────────────────────────────────

create or replace function tryout_submit_eval_by_token(
  p_token         uuid,
  p_team_label    text,
  p_coach_name    text,
  p_player_scores jsonb   -- { "player-uuid": { "field_key": 1-5, ... }, ... }
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

  -- Validate all player IDs belong to this org
  for v_player_id, v_scores in
    select key::uuid, value
    from jsonb_each(p_player_scores)
  loop
    -- Skip if player doesn't belong to this org
    if not exists (
      select 1 from tryout_players
      where id = v_player_id and org_id = v_org_id
    ) then
      continue;
    end if;

    insert into tryout_coach_evals (
      player_id, org_id, season_id, season_year,
      team_label, coach_name, scores, status, submitted_at
    ) values (
      v_player_id, v_org_id, v_season_id, v_season_year,
      trim(p_team_label), trim(p_coach_name), v_scores, 'submitted', now()
    )
    on conflict (player_id, org_id, season_year) do update set
      scores       = excluded.scores,
      coach_name   = excluded.coach_name,
      team_label   = excluded.team_label,
      season_id    = excluded.season_id,
      status       = 'submitted',
      submitted_at = now(),
      updated_at   = now();

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('submitted', v_count, 'team', p_team_label);
end;
$$;

grant execute on function tryout_eval_form_data_by_token(uuid)                    to anon, authenticated;
grant execute on function tryout_submit_eval_by_token(uuid, text, text, jsonb)    to anon, authenticated;

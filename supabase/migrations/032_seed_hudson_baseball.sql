-- ============================================================
-- Six43 – Migration 032: Seed Hudson Baseball org
-- ============================================================
-- Run this in the Supabase SQL editor after applying 029–031.
-- Replace YOUR_USER_ID_HERE with your actual auth.users UUID.
-- (Find it: Supabase dashboard → Authentication → Users → your email)
-- ============================================================

do $$
declare
  v_admin_id  uuid := 'YOUR_USER_ID_HERE';  -- ← replace this
  v_org_id    uuid;
  v_season_id uuid;
begin

  -- ── Create Hudson Baseball org ──────────────────────────────
  insert into tryout_orgs (name, sport, slug, admin_user_id)
  values ('Hudson Baseball', 'baseball', 'hudson-baseball', v_admin_id)
  on conflict (slug) do nothing
  returning id into v_org_id;

  if v_org_id is null then
    select id into v_org_id from tryout_orgs where slug = 'hudson-baseball';
  end if;

  -- ── Create 2026 season ──────────────────────────────────────
  insert into tryout_seasons (
    org_id, year, label, sport, age_groups,
    tryout_weight, coach_eval_weight, intangibles_weight, prior_stats_weight
  ) values (
    v_org_id, 2026, '2026 Season', 'baseball',
    array['8U','9U','10U','11U','12U'],
    0.400, 0.400, 0.100, 0.100
  )
  on conflict (org_id, year) do nothing
  returning id into v_season_id;

  if v_season_id is null then
    select id into v_season_id from tryout_seasons
    where org_id = v_org_id and year = 2026;
  end if;

  -- ── Seed Hudson Baseball tryout scoring config ──────────────
  -- Weights sum to 1.0. Pitching/catching are optional (not all players)
  insert into tryout_scoring_config
    (season_id, category, label, subcategories, weight, is_optional, sort_order)
  values
    (v_season_id, 'speed',       '60-yard Dash',   '[{"key":"speed_60yd","label":"60yd","weight":1.0}]',                                                                            0.11, false, 1),
    (v_season_id, 'ground_balls','Ground Balls',   '[{"key":"gb_hands","label":"Hands","weight":0.33},{"key":"gb_range","label":"Range","weight":0.33},{"key":"gb_arm","label":"Arm","weight":0.34}]', 0.11, false, 2),
    (v_season_id, 'fly_balls',   'Fly Balls',      '[{"key":"fb_judging","label":"Judging","weight":0.33},{"key":"fb_catching","label":"Catching","weight":0.33},{"key":"fb_arm","label":"Arm","weight":0.34}]', 0.11, false, 3),
    (v_season_id, 'hitting',     'Hitting',        '[{"key":"hit_contact","label":"Contact","weight":0.50},{"key":"hit_power","label":"Power","weight":0.50}]',                     0.17, false, 4),
    (v_season_id, 'pitching',    'Pitching',       '[{"key":"pitch_velo","label":"Velo","weight":0.50},{"key":"pitch_control","label":"Control","weight":0.50}]',                   0.17, true,  5),
    (v_season_id, 'catching',    'Catching',       '[{"key":"catcher_receiving","label":"Receiving","weight":0.50},{"key":"catcher_arm","label":"Arm","weight":0.50}]',            0.33, true,  6)
  on conflict (season_id, category) do nothing;

  -- ── Seed Hudson Baseball coach eval rubric ──────────────────
  insert into tryout_coach_eval_config
    (org_id, season_id, section, field_key, label, is_optional, sort_order)
  values
    -- Fielding & Hitting
    (v_org_id, v_season_id, 'fielding_hitting', 'fielding_ground_balls', 'Fielding Ground Balls', false, 1),
    (v_org_id, v_season_id, 'fielding_hitting', 'catching_fly_balls',    'Catching Fly Balls',    false, 2),
    (v_org_id, v_season_id, 'fielding_hitting', 'receiving_throws',      'Receiving Throws',      false, 3),
    (v_org_id, v_season_id, 'fielding_hitting', 'range_footwork',        'Range/Footwork',        false, 4),
    (v_org_id, v_season_id, 'fielding_hitting', 'throwing',              'Throwing',              false, 5),
    (v_org_id, v_season_id, 'fielding_hitting', 'hitting',               'Hitting',               false, 6),
    (v_org_id, v_season_id, 'fielding_hitting', 'speed',                 'Speed',                 false, 7),
    (v_org_id, v_season_id, 'fielding_hitting', 'athleticism',           'Athleticism',           false, 8),
    -- Pitching & Catching (optional — not all players)
    (v_org_id, v_season_id, 'pitching_catching', 'pitching',             'Pitching',              true,  9),
    (v_org_id, v_season_id, 'pitching_catching', 'catching',             'Catching',              true,  10),
    -- Intangibles
    (v_org_id, v_season_id, 'intangibles', 'in_game_decision_making',    'In-Game Decision Making', false, 11),
    (v_org_id, v_season_id, 'intangibles', 'coachability',               'Coachability',          false, 12),
    (v_org_id, v_season_id, 'intangibles', 'attitude',                   'Attitude',              false, 13),
    (v_org_id, v_season_id, 'intangibles', 'composure',                  'Composure',             false, 14),
    (v_org_id, v_season_id, 'intangibles', 'commitment',                 'Commitment',            false, 15),
    (v_org_id, v_season_id, 'intangibles', 'leadership',                 'Leadership',            false, 16)
  on conflict (org_id, season_id, field_key) do nothing;

  raise notice 'Hudson Baseball seeded. org_id=%, season_id=%', v_org_id, v_season_id;
end $$;

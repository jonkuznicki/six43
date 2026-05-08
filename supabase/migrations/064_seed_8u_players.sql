-- ============================================================
-- Six43 – Migration 064: Seed 8U sample players for Hudson Baseball
-- ============================================================
-- Adds 14 realistic 8U players to the Hudson Baseball org.
-- Most have only tryout/coach eval data (first-timers).
-- A few have prior 7U GameChanger stats to test GC columns,
-- missing-data handling, and mixed-source scoring.
-- ============================================================

do $$
declare
  v_org_id      uuid;
  v_season_id   uuid;
  v_season_year text := '2025';  -- coach evals for the 2026 tryout season use year-1 convention

  -- player IDs (generated deterministically via md5 so re-runs are idempotent)
  p1  uuid := md5('8u-carter-walsh')::uuid;
  p2  uuid := md5('8u-liam-foster')::uuid;
  p3  uuid := md5('8u-noah-kim')::uuid;
  p4  uuid := md5('8u-mason-patel')::uuid;
  p5  uuid := md5('8u-ethan-brooks')::uuid;
  p6  uuid := md5('8u-aiden-nguyen')::uuid;
  p7  uuid := md5('8u-jackson-reyes')::uuid;
  p8  uuid := md5('8u-oliver-hayes')::uuid;
  p9  uuid := md5('8u-lucas-chen')::uuid;
  p10 uuid := md5('8u-ryan-mitchell')::uuid;
  p11 uuid := md5('8u-gavin-torres')::uuid;
  p12 uuid := md5('8u-dylan-scott')::uuid;
  p13 uuid := md5('8u-tyler-morgan')::uuid;
  p14 uuid := md5('8u-jake-cooper')::uuid;
begin

  select id into v_org_id from tryout_orgs where slug = 'hudson-baseball';
  if v_org_id is null then
    raise notice '8U seed skipped — hudson-baseball org not found. Run 032 first.';
    return;
  end if;

  select id into v_season_id
    from tryout_seasons
   where org_id = v_org_id and year = 2026;
  if v_season_id is null then
    raise notice '8U seed skipped — 2026 season not found. Run 032 first.';
    return;
  end if;

  -- ── Players ────────────────────────────────────────────────────────────────
  -- 14 8U players. 3 have prior 7U team history (will also get GC stats below).
  -- prior_team is the team the player played for in the prior season.

  insert into tryout_players
    (id, org_id, first_name, last_name, age_group, tryout_age_group, prior_team, is_active)
  values
    -- Players with NO prior history (first-timers at a structured tryout)
    (p1,  v_org_id, 'Carter',  'Walsh',    '8U', '8U', null,              true),
    (p2,  v_org_id, 'Liam',    'Foster',   '8U', '8U', null,              true),
    (p3,  v_org_id, 'Noah',    'Kim',      '8U', '8U', null,              true),
    (p4,  v_org_id, 'Mason',   'Patel',    '8U', '8U', null,              true),
    (p5,  v_org_id, 'Ethan',   'Brooks',   '8U', '8U', null,              true),
    (p6,  v_org_id, 'Aiden',   'Nguyen',   '8U', '8U', null,              true),
    (p7,  v_org_id, 'Jackson', 'Reyes',    '8U', '8U', null,              true),
    (p8,  v_org_id, 'Oliver',  'Hayes',    '8U', '8U', null,              true),
    (p9,  v_org_id, 'Lucas',   'Chen',     '8U', '8U', null,              true),
    (p10, v_org_id, 'Ryan',    'Mitchell', '8U', '8U', null,              true),
    -- Players with prior 7U history (will have GC stats)
    (p11, v_org_id, 'Gavin',   'Torres',   '8U', '8U', 'Hudson 7U Blue',  true),
    (p12, v_org_id, 'Dylan',   'Scott',    '8U', '8U', 'Hudson 7U Blue',  true),
    (p13, v_org_id, 'Tyler',   'Morgan',   '8U', '8U', 'Hudson 7U White', true),
    (p14, v_org_id, 'Jake',    'Cooper',   '8U', '8U', 'Hudson 7U White', true)
  on conflict (id) do nothing;

  -- ── GC Stats (prior-year 7U data) ──────────────────────────────────────────
  -- Only 4 players have prior stats; the data is intentionally sparse/modest
  -- to reflect realistic 7U production. No pitching stats for most.

  insert into tryout_gc_stats
    (player_id, org_id, season_year, team_label, source,
     games_played, pa, ab, avg, obp, slg, ops,
     h, doubles, triples, hr, rbi, r, bb, so, sb,
     gc_hitting_score, gc_pitching_score, gc_computed_score)
  values
    -- Gavin Torres — solid hitter, no pitching data
    (p11, v_org_id, v_season_year, 'Hudson 7U Blue', 'gamechanger',
     10, 32, 28, 0.321, 0.375, 0.464, 0.839,
     9,  2, 0, 0, 7, 6, 4, 5, 3,
     3.20, null, 3.20),

    -- Dylan Scott — good avg, below avg power, some SB
    (p12, v_org_id, v_season_year, 'Hudson 7U Blue', 'gamechanger',
     8,  25, 22, 0.273, 0.320, 0.364, 0.684,
     6,  1, 0, 0, 4, 4, 3, 6, 5,
     2.60, null, 2.60),

    -- Tyler Morgan — hits and pitches a little (7U arm, early exposure only)
    (p13, v_org_id, v_season_year, 'Hudson 7U White', 'gamechanger',
     9,  28, 25, 0.360, 0.393, 0.520, 0.913,
     9,  2, 1, 0, 8, 7, 3, 4, 2,
     3.60, 2.80, 3.30),

    -- Jake Cooper — limited at-bats, struggled; missing some stat columns (realistic gap)
    (p14, v_org_id, v_season_year, 'Hudson 7U White', 'gamechanger',
     5,  14, 13, 0.154, 0.214, 0.231, 0.445,
     2,  0, 0, 0, 1, 1, 1, 7, 0,
     1.40, null, 1.40)
  on conflict (player_id, org_id, season_year) do nothing;

  -- ── Coach Evals (submitted, for players whose prior coaches evaluated them) ──
  -- 6 of 14 players have submitted evals. Scores are modest (1–4 range, 8U kids).
  -- Season year = 2025 (prior year convention: season.year - 1 = 2026 - 1).

  insert into tryout_coach_evals
    (player_id, org_id, season_year, team_label, coach_name,
     status, submitted_at,
     scores, computed_score, intangibles_score,
     comments)
  values
    -- Carter Walsh — strong eval, no prior team (community coach submitted)
    (p1, v_org_id, v_season_year, 'Rec League', 'Coach R. Hartman',
     'submitted', now() - interval '14 days',
     '{"fielding_ground_balls":4,"catching_fly_balls":3,"receiving_throws":3,"range_footwork":4,"throwing":4,"hitting":4,"speed":4,"athleticism":4,"in_game_decision_making":3,"coachability":5,"attitude":5,"composure":4,"commitment":5,"leadership":3}',
     3.90, 4.00,
     'Great attitude. Confident at the plate for his age. Footwork needs work but has the athleticism to improve quickly.'),

    -- Ethan Brooks — above average across the board
    (p5, v_org_id, v_season_year, 'Rec League', 'Coach R. Hartman',
     'submitted', now() - interval '14 days',
     '{"fielding_ground_balls":3,"catching_fly_balls":3,"receiving_throws":3,"range_footwork":3,"throwing":3,"hitting":3,"speed":3,"athleticism":3,"in_game_decision_making":3,"coachability":4,"attitude":4,"composure":3,"commitment":4,"leadership":3}',
     3.10, 3.50,
     'Solid all-around kid. Nothing flashy but consistent. Good teammate.'),

    -- Jackson Reyes — raw athlete, limited baseball skill so far
    (p7, v_org_id, v_season_year, 'Rec League', 'Coach D. Alvarez',
     'submitted', now() - interval '10 days',
     '{"fielding_ground_balls":2,"catching_fly_balls":3,"receiving_throws":2,"range_footwork":3,"throwing":3,"hitting":2,"speed":5,"athleticism":5,"in_game_decision_making":2,"coachability":3,"attitude":4,"composure":2,"commitment":3,"leadership":2}',
     2.90, 2.75,
     'Elite speed and athleticism for this age. Baseball IQ still developing — high ceiling kid if he sticks with it.'),

    -- Gavin Torres — eval from prior 7U coach (has GC stats too)
    (p11, v_org_id, v_season_year, 'Hudson 7U Blue', 'Coach M. Rivera',
     'submitted', now() - interval '7 days',
     '{"fielding_ground_balls":3,"catching_fly_balls":3,"receiving_throws":3,"range_footwork":3,"throwing":4,"hitting":4,"speed":3,"athleticism":4,"in_game_decision_making":3,"coachability":4,"attitude":4,"composure":3,"commitment":4,"leadership":3}',
     3.40, 3.50,
     'Reliable player. Good bat for his age group. Improved a lot from start of season to end.'),

    -- Tyler Morgan — strong hitting, eval + GC stats both present
    (p13, v_org_id, v_season_year, 'Hudson 7U White', 'Coach S. Patterson',
     'submitted', now() - interval '7 days',
     '{"fielding_ground_balls":3,"catching_fly_balls":4,"receiving_throws":3,"range_footwork":3,"throwing":4,"hitting":4,"speed":3,"athleticism":4,"pitching":3,"in_game_decision_making":4,"coachability":5,"attitude":5,"composure":4,"commitment":5,"leadership":4}',
     3.80, 4.40,
     'Best hitter on the 7U White team. Also showed some pitching ability late in the season. High character kid.'),

    -- Dylan Scott — partial eval (some fields missing — tests null handling)
    (p12, v_org_id, v_season_year, 'Hudson 7U Blue', 'Coach M. Rivera',
     'submitted', now() - interval '7 days',
     '{"fielding_ground_balls":3,"catching_fly_balls":2,"throwing":3,"hitting":3,"speed":4,"athleticism":3,"coachability":3,"attitude":3,"commitment":3}',
     3.00, 3.00,
     null)
  on conflict (player_id, org_id, season_year) do nothing;

  raise notice '8U seed complete — players, GC stats, and coach evals inserted for Hudson Baseball 2026 season.';
end $$;

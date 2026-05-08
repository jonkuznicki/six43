-- ============================================================
-- Six43 – Migration 065: Seed 8U tryout session scores for Hudson Baseball
-- ============================================================
-- Creates a closed tryout session for 8U, checks in all 14 seeded players,
-- and inserts tryout_scores with pre-computed tryout_score values.
-- This gives the Team Making page realistic tryout data to display.
--
-- Idempotent: uses deterministic UUIDs + ON CONFLICT DO NOTHING throughout.
--
-- Scoring weights after migration 050:
--   speed = tiebreaker (not counted), gb=0.33, fb=0.33, hitting=0.34
--   pitching/catching = weight 0 (stored separately, not in tryout_score)
--
-- Depends on: 032 (org/season/config), 050 (weight updates), 064 (8U players)
-- ============================================================

do $$
declare
  v_org_id     uuid;
  v_season_id  uuid;
  v_session_id uuid;

  -- Deterministic UUIDs so re-runs are fully idempotent
  v_session_id_det uuid := md5('hudson-8u-session-1-2025-03-15')::uuid;
  v_eval_id        uuid := md5('seed-evaluator-coach-johnson')::uuid;

  -- Player IDs (same deterministic UUIDs as migration 064)
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
    raise notice '8U score seed skipped — hudson-baseball org not found.';
    return;
  end if;

  select id into v_season_id
    from tryout_seasons
   where org_id = v_org_id and year = 2026;
  if v_season_id is null then
    raise notice '8U score seed skipped — 2026 season not found.';
    return;
  end if;

  v_session_id := v_session_id_det;

  -- ── Tryout session ────────────────────────────────────────────────────────────
  insert into tryout_sessions
    (id, org_id, season_id, age_group, session_date, label, status)
  values
    (v_session_id, v_org_id, v_season_id, '8U', '2025-03-15', '8U Session 1', 'closed')
  on conflict (id) do nothing;

  -- ── Check-ins (all 14 8U players) ────────────────────────────────────────────
  -- season_id and age_group required (NOT NULL) since migration 050.
  -- Unique constraint is (season_id, age_group, tryout_number).
  insert into tryout_checkins (session_id, season_id, age_group, player_id, tryout_number)
  values
    (v_session_id, v_season_id, '8U', p1,  1),
    (v_session_id, v_season_id, '8U', p2,  2),
    (v_session_id, v_season_id, '8U', p3,  3),
    (v_session_id, v_season_id, '8U', p4,  4),
    (v_session_id, v_season_id, '8U', p5,  5),
    (v_session_id, v_season_id, '8U', p6,  6),
    (v_session_id, v_season_id, '8U', p7,  7),
    (v_session_id, v_season_id, '8U', p8,  8),
    (v_session_id, v_season_id, '8U', p9,  9),
    (v_session_id, v_season_id, '8U', p10, 10),
    (v_session_id, v_season_id, '8U', p11, 11),
    (v_session_id, v_season_id, '8U', p12, 12),
    (v_session_id, v_season_id, '8U', p13, 13),
    (v_session_id, v_season_id, '8U', p14, 14)
  on conflict (season_id, age_group, tryout_number) do nothing;

  -- ── Tryout scores ─────────────────────────────────────────────────────────────
  -- Subcategory scores are 1–5 integers.
  -- tryout_score formula (per migration 050 weights):
  --   gb_avg  = gb_hands*0.33 + gb_range*0.33 + gb_arm*0.34
  --   fb_avg  = fb_judging*0.33 + fb_catching*0.33 + fb_arm*0.34
  --   hit_avg = (hit_contact + hit_power) / 2
  --   tryout_score = gb_avg*0.33 + fb_avg*0.33 + hit_avg*0.34
  -- Speed stored as tiebreaker — not counted. Pitching/catching weight=0.

  insert into tryout_scores
    (player_id, session_id, org_id, evaluator_id, evaluator_name,
     scores, tryout_score, tryout_pitching, submitted_at)
  values

    -- p1 Carter Walsh — strong all-around (coach eval 3.90)
    -- gb=(4,4,3)→3.66  fb=(4,4,3)→3.66  hit=(4,3)→3.5  → score=3.606
    (p1, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":4,"gb_hands":4,"gb_range":4,"gb_arm":3,"fb_judging":4,"fb_catching":4,"fb_arm":3,"hit_contact":4,"hit_power":3}',
     3.606, null, now() - interval '54 days'),

    -- p2 Liam Foster — average
    -- gb=(3,3,3)→3.0  fb=(3,3,2)→2.66  hit=(3,3)→3.0  → score=2.888
    (p2, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":3,"gb_hands":3,"gb_range":3,"gb_arm":3,"fb_judging":3,"fb_catching":3,"fb_arm":2,"hit_contact":3,"hit_power":3}',
     2.888, null, now() - interval '54 days'),

    -- p3 Noah Kim — solid average
    -- gb=fb=hit=3.0  → score=3.000
    (p3, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":3,"gb_hands":3,"gb_range":3,"gb_arm":3,"fb_judging":3,"fb_catching":3,"fb_arm":3,"hit_contact":3,"hit_power":3}',
     3.000, null, now() - interval '54 days'),

    -- p4 Mason Patel — below average
    -- gb=(3,2,3)→2.67  fb=(3,2,2)→2.33  hit=(3,2)→2.5  → score=2.500
    (p4, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":3,"gb_hands":3,"gb_range":2,"gb_arm":3,"fb_judging":3,"fb_catching":2,"fb_arm":2,"hit_contact":3,"hit_power":2}',
     2.500, null, now() - interval '54 days'),

    -- p5 Ethan Brooks — consistent, nothing flashy (coach eval 3.10)
    -- gb=fb=hit=3.0  → score=3.000
    (p5, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":3,"gb_hands":3,"gb_range":3,"gb_arm":3,"fb_judging":3,"fb_catching":3,"fb_arm":3,"hit_contact":3,"hit_power":3}',
     3.000, null, now() - interval '54 days'),

    -- p6 Aiden Nguyen — above average, good range
    -- gb=(3,4,3)→3.33  fb=3.0  hit=3.0  → score=3.109
    (p6, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":4,"gb_hands":3,"gb_range":4,"gb_arm":3,"fb_judging":3,"fb_catching":3,"fb_arm":3,"hit_contact":3,"hit_power":3}',
     3.109, null, now() - interval '54 days'),

    -- p7 Jackson Reyes — elite speed (tiebreaker, not counted), raw skills (coach eval 2.90)
    -- gb=(2,2,3)→2.34  fb=(3,2,2)→2.33  hit=(2,2)→2.0  → score=2.221
    (p7, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":5,"gb_hands":2,"gb_range":2,"gb_arm":3,"fb_judging":3,"fb_catching":2,"fb_arm":2,"hit_contact":2,"hit_power":2}',
     2.221, null, now() - interval '54 days'),

    -- p8 Oliver Hayes — good hitter
    -- gb=fb=3.0  hit=(4,3)→3.5  → score=3.170
    (p8, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":3,"gb_hands":3,"gb_range":3,"gb_arm":3,"fb_judging":3,"fb_catching":3,"fb_arm":3,"hit_contact":4,"hit_power":3}',
     3.170, null, now() - interval '54 days'),

    -- p9 Lucas Chen — slightly below average
    -- gb=(3,3,2)→2.66  fb=(3,2,3)→2.67  hit=(3,2)→2.5  → score=2.609
    (p9, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":3,"gb_hands":3,"gb_range":3,"gb_arm":2,"fb_judging":3,"fb_catching":2,"fb_arm":3,"hit_contact":3,"hit_power":2}',
     2.609, null, now() - interval '54 days'),

    -- p10 Ryan Mitchell — above average, strong arm and power
    -- gb=(4,3,3)→3.33  fb=3.0  hit=(3,4)→3.5  → score=3.279
    (p10, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":4,"gb_hands":4,"gb_range":3,"gb_arm":3,"fb_judging":3,"fb_catching":3,"fb_arm":3,"hit_contact":3,"hit_power":4}',
     3.279, null, now() - interval '54 days'),

    -- p11 Gavin Torres — reliable, good range (coach eval 3.40, GC 3.20)
    -- gb=(3,4,3)→3.33  fb=(3,4,3)→3.33  hit=(4,3)→3.5  → score=3.388
    (p11, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":3,"gb_hands":3,"gb_range":4,"gb_arm":3,"fb_judging":3,"fb_catching":4,"fb_arm":3,"hit_contact":4,"hit_power":3}',
     3.388, null, now() - interval '54 days'),

    -- p12 Dylan Scott — good speed (tiebreaker), average skills (coach eval 3.00, GC 2.60)
    -- gb=fb=hit=3.0  → score=3.000
    (p12, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":4,"gb_hands":3,"gb_range":3,"gb_arm":3,"fb_judging":3,"fb_catching":3,"fb_arm":3,"hit_contact":3,"hit_power":3}',
     3.000, null, now() - interval '54 days'),

    -- p13 Tyler Morgan — best hitter, also pitches (coach eval 3.80, GC 3.60)
    -- gb=(4,3,4)→3.67  fb=(4,4,3)→3.66  hit=(4,4)→4.0  pitch=(4,4)→stored only
    -- score=3.779; tryout_pitching=4.000
    (p13, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":3,"gb_hands":4,"gb_range":3,"gb_arm":4,"fb_judging":4,"fb_catching":4,"fb_arm":3,"hit_contact":4,"hit_power":4,"pitch_velo":4,"pitch_control":4}',
     3.779, 4.000, now() - interval '54 days'),

    -- p14 Jake Cooper — struggled (GC batting avg .154)
    -- gb=fb=hit=2.0  → score=2.000
    (p14, v_session_id, v_org_id, v_eval_id, 'Coach D. Johnson',
     '{"speed_60yd":2,"gb_hands":2,"gb_range":2,"gb_arm":2,"fb_judging":2,"fb_catching":2,"fb_arm":2,"hit_contact":2,"hit_power":2}',
     2.000, null, now() - interval '54 days')

  on conflict (player_id, session_id, evaluator_id) do nothing;

  raise notice '8U tryout scores seeded — session_id=%, 14 players scored.', v_session_id;
end $$;

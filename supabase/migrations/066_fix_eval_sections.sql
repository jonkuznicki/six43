-- ============================================================
-- Six43 – Migration 066: Move speed/athleticism to their own eval section
-- ============================================================
-- The seed (032) placed "speed" and "athleticism" fields under the
-- fielding_hitting section. They should be their own "Athleticism"
-- section so the table header groups align with the intended structure:
--
--   Fielding / Hitting (6 fields): fielding_ground_balls, catching_fly_balls,
--                                   receiving_throws, range_footwork, throwing, hitting
--   Athleticism (2 fields):        speed, athleticism
--   Pitching / Catching (2 fields): pitching, catching
--   Intangibles (6 fields):        in_game_decision_making, coachability, attitude,
--                                   composure, commitment, leadership
--
-- Idempotent: re-running updates only rows that still have section='fielding_hitting'
-- for those two field_keys, which will be a no-op after the first run.
-- ============================================================

update tryout_coach_eval_config
   set section = 'athleticism'
 where field_key in ('speed', 'athleticism')
   and section = 'fielding_hitting';

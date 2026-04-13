-- ============================================================
-- Six43 – Migration 025: coach access to tournaments
-- ============================================================
-- Migration 023 added coach read access to teams, seasons, games,
-- players, lineup_slots, and pitcher_plans, but missed tournaments.
-- Without this, coaches see games grouped under unknown tournament IDs
-- but the tournament names/headers are blank.
-- ============================================================

CREATE POLICY "coaches read their tournaments"
  ON tournaments FOR SELECT
  USING (
    season_id IN (
      SELECT id FROM seasons
      WHERE team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

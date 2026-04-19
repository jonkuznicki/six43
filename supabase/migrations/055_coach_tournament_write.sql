-- ============================================================
-- Six43 – Migration 055: coach write access to tournaments
-- ============================================================
-- Coaches could read tournaments (migration 025) but not create,
-- edit, or delete them. This caused a row-level security error
-- when an assistant coach tried to add a tournament.
-- ============================================================

CREATE POLICY "coaches insert their tournaments"
  ON tournaments FOR INSERT
  WITH CHECK (
    season_id IN (
      SELECT id FROM seasons
      WHERE team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

CREATE POLICY "coaches update their tournaments"
  ON tournaments FOR UPDATE
  USING (
    season_id IN (
      SELECT id FROM seasons
      WHERE team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

CREATE POLICY "coaches delete their tournaments"
  ON tournaments FOR DELETE
  USING (
    season_id IN (
      SELECT id FROM seasons
      WHERE team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

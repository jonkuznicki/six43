-- ============================================================
-- Six43 – Migration 062: add owner policy for game_extra_pitchers
-- ============================================================
-- Migration 056 created coach policies only. Team owners (the user
-- whose auth.uid() matches teams.user_id) have no policy, so their
-- inserts are blocked by RLS. Every other game-related table has
-- an owner "users manage their X" policy from migration 003 — this
-- migration adds the equivalent for game_extra_pitchers.
-- ============================================================

CREATE POLICY "users manage their extra pitchers"
  ON game_extra_pitchers FOR ALL
  USING (
    game_id IN (
      SELECT g.id FROM games g
      JOIN seasons s ON s.id = g.season_id
      JOIN teams   t ON t.id = s.team_id
      WHERE t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    game_id IN (
      SELECT g.id FROM games g
      JOIN seasons s ON s.id = g.season_id
      JOIN teams   t ON t.id = s.team_id
      WHERE t.user_id = auth.uid()
    )
  );

-- ============================================================
-- Six43 – Migration 026: coach write access to lineup slots
-- ============================================================
-- Migration 023 gave coaches SELECT on lineup_slots, but coaches
-- also need INSERT and UPDATE so they can build and edit lineups.
-- Without these policies, changes appear to save in the UI (state
-- updates in memory) but the Supabase calls are silently rejected
-- by RLS, so nothing persists when the coach navigates away.
--
-- Coaches do NOT get DELETE — only team owners can remove slots.
-- ============================================================

-- Helper sub-query used in both policies
-- Coaches can write to lineup_slots for games on teams they coach.

CREATE POLICY "coaches insert lineup slots"
  ON lineup_slots FOR INSERT
  WITH CHECK (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

CREATE POLICY "coaches update lineup slots"
  ON lineup_slots FOR UPDATE
  USING (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  )
  WITH CHECK (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

-- Pitcher plans: coaches need UPDATE to log pitch counts
CREATE POLICY "coaches update pitcher plans"
  ON pitcher_plans FOR UPDATE
  USING (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  )
  WITH CHECK (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

CREATE POLICY "coaches insert pitcher plans"
  ON pitcher_plans FOR INSERT
  WITH CHECK (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

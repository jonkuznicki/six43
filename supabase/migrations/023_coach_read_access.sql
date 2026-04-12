-- ============================================================
-- Six43 – Migration 023: coach read access
-- ============================================================
-- Accepted team_members (coaches) currently can't see any team
-- data because all RLS policies are locked to team owners only.
-- This migration adds SELECT (read) policies for accepted coaches
-- across all relevant tables.
-- ============================================================

-- Helper: returns all team_ids the current user is an accepted coach on.
-- SECURITY DEFINER to bypass RLS when querying team_members directly.
CREATE OR REPLACE FUNCTION public.get_my_coached_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id
  FROM team_members
  WHERE user_id = auth.uid()
    AND accepted_at IS NOT NULL
$$;

-- ----------------------------------------------------------------
-- TEAMS: coaches can read teams they've been accepted into
-- ----------------------------------------------------------------
CREATE POLICY "coaches read their teams"
  ON teams FOR SELECT
  USING (
    id IN (SELECT public.get_my_coached_team_ids())
  );

-- ----------------------------------------------------------------
-- SEASONS: coaches can read seasons for their teams
-- ----------------------------------------------------------------
CREATE POLICY "coaches read their seasons"
  ON seasons FOR SELECT
  USING (
    team_id IN (SELECT public.get_my_coached_team_ids())
  );

-- ----------------------------------------------------------------
-- GAMES: coaches can read games for their teams' seasons
-- ----------------------------------------------------------------
CREATE POLICY "coaches read their games"
  ON games FOR SELECT
  USING (
    season_id IN (
      SELECT id FROM seasons
      WHERE team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

-- ----------------------------------------------------------------
-- PLAYERS: coaches can read players for their teams
-- ----------------------------------------------------------------
CREATE POLICY "coaches read their players"
  ON players FOR SELECT
  USING (
    team_id IN (SELECT public.get_my_coached_team_ids())
  );

-- ----------------------------------------------------------------
-- LINEUP SLOTS: coaches can read lineup slots for their games
-- ----------------------------------------------------------------
CREATE POLICY "coaches read their lineup slots"
  ON lineup_slots FOR SELECT
  USING (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

-- ----------------------------------------------------------------
-- PITCHER PLANS: coaches can read pitcher plans for their games
-- ----------------------------------------------------------------
CREATE POLICY "coaches read their pitcher plans"
  ON pitcher_plans FOR SELECT
  USING (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

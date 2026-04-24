-- ============================================================
-- Six43 – Migration 061: fix game_extra_pitchers RLS
-- ============================================================
-- The INSERT/UPDATE/DELETE policies on game_extra_pitchers join
-- games and seasons tables inside the WITH CHECK expression.
-- Those inner queries run under RLS, which can silently fail for
-- coaches and block valid inserts.
--
-- Fix: use a SECURITY DEFINER helper (same pattern as
-- get_my_coached_team_ids) so the join bypasses RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.i_coach_this_game(p_game_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM games g
    JOIN seasons s ON s.id = g.season_id
    WHERE g.id = p_game_id
      AND s.team_id IN (SELECT public.get_my_coached_team_ids())
  )
$$;

-- Re-create all four policies using the helper

DROP POLICY IF EXISTS "coaches read their extra pitchers"   ON game_extra_pitchers;
DROP POLICY IF EXISTS "coaches insert extra pitchers"       ON game_extra_pitchers;
DROP POLICY IF EXISTS "coaches update extra pitchers"       ON game_extra_pitchers;
DROP POLICY IF EXISTS "coaches delete extra pitchers"       ON game_extra_pitchers;

CREATE POLICY "coaches read their extra pitchers"
  ON game_extra_pitchers FOR SELECT
  USING (public.i_coach_this_game(game_id));

CREATE POLICY "coaches insert extra pitchers"
  ON game_extra_pitchers FOR INSERT
  WITH CHECK (public.i_coach_this_game(game_id));

CREATE POLICY "coaches update extra pitchers"
  ON game_extra_pitchers FOR UPDATE
  USING  (public.i_coach_this_game(game_id))
  WITH CHECK (public.i_coach_this_game(game_id));

CREATE POLICY "coaches delete extra pitchers"
  ON game_extra_pitchers FOR DELETE
  USING (public.i_coach_this_game(game_id));

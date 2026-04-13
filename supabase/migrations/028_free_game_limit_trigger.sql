-- ============================================================
-- Six43 – Migration 028: enforce free-tier game limit at DB level
-- ============================================================
-- The client-side check in /games/new is UI-only and can be bypassed
-- (direct API calls, GameChanger sync, import, tournament creation).
-- This trigger fires BEFORE every INSERT on games and rejects the row
-- if the team owner is on the free plan and already has 10+ games.
--
-- Pro users and service-role calls (admin operations) are unaffected.
-- Placeholder games (tournament slots) count toward the limit to stay
-- consistent with how the client counts games.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_free_game_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id  uuid;
  v_plan      text;
  v_game_cnt  integer;
BEGIN
  -- Resolve the team owner for this game's season
  SELECT t.user_id INTO v_owner_id
  FROM seasons s
  JOIN teams   t ON t.id = s.team_id
  WHERE s.id = NEW.season_id;

  -- Can't determine owner — allow insert (shouldn't happen in practice)
  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up plan (no row = free)
  SELECT plan INTO v_plan
  FROM user_plans
  WHERE user_id = v_owner_id;

  -- Pro accounts have no limit
  IF v_plan = 'pro' THEN
    RETURN NEW;
  END IF;

  -- Count all existing games owned by this user across all seasons
  SELECT COUNT(*) INTO v_game_cnt
  FROM games  g
  JOIN seasons s ON s.id = g.season_id
  JOIN teams   t ON t.id = s.team_id
  WHERE t.user_id = v_owner_id;

  IF v_game_cnt >= 10 THEN
    RAISE EXCEPTION
      'Free plan limit reached (10 games). Upgrade to Pro to add more games.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_free_game_limit
  BEFORE INSERT ON games
  FOR EACH ROW
  EXECUTE FUNCTION public.check_free_game_limit();

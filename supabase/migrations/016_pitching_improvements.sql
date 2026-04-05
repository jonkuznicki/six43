-- ============================================================
-- Six43 – Migration 016: pitching improvements
-- ============================================================

-- Expand pitcher_slot range from 1–4 to 1–9 to support more pitchers per game
ALTER TABLE pitcher_plans DROP CONSTRAINT IF EXISTS pitcher_plans_pitcher_slot_check;
ALTER TABLE pitcher_plans ADD CONSTRAINT pitcher_plans_pitcher_slot_check
  CHECK (pitcher_slot BETWEEN 1 AND 9);

-- Store actual pitch counts on the lineup slot (natural home for per-player-per-game data)
ALTER TABLE lineup_slots ADD COLUMN IF NOT EXISTS pitch_count integer;

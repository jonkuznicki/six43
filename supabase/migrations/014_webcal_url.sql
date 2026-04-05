-- ============================================================
-- Six43 – Migration 014: webcal_url + game_number
-- ============================================================

-- Store the GameChanger webcal URL on the season so we can re-sync later
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS webcal_url text;

-- game_number: coach-facing sequential number (1, 2, 3 …) within a season
-- Managed in app code (max + 1), not a DB serial, so null is fine for old rows
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_number integer;

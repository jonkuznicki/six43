-- ============================================================
-- Six43 – Migration 015: timezone on seasons
-- ============================================================

-- Store the team's timezone so iCal UTC times are converted correctly on import/sync
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS timezone text;

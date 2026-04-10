-- ============================================================
-- Six43 – Migration 019: pitch count limit per season
-- ============================================================

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS pitch_count_limit integer;

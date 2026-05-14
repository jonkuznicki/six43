-- ============================================================
-- Six43 – Migration 071: Store raw player name in registration staging
-- ============================================================
-- Preserves the first/last name exactly as it appeared in the
-- registration CSV, independent of the canonical tryout_players record.
-- ============================================================

alter table tryout_registration_staging
  add column if not exists player_first_name text,
  add column if not exists player_last_name  text;

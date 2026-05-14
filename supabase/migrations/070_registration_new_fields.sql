-- ============================================================
-- Six43 – Migration 070: Add new fields for 2027 registration CSV
-- ============================================================
-- tryout_players: guardian names (cross-season identity)
-- tryout_registration_staging: all new per-season fields
-- ============================================================

-- Guardian names on the canonical player record
alter table tryout_players
  add column if not exists guardian_first_name text,
  add column if not exists guardian_last_name  text;

-- New per-season registration fields
alter table tryout_registration_staging
  add column if not exists registration_date     date,
  add column if not exists guardian_first_name   text,
  add column if not exists guardian_last_name    text,
  add column if not exists address               text,
  add column if not exists city                  text,
  add column if not exists state                 text,
  add column if not exists zip                   text,
  add column if not exists current_team_division text;

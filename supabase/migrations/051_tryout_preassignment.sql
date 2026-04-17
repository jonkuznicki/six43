-- Migration 051: Pre-assignment support for tryout sessions
--
-- Players can be assigned to a session in advance (from registration data).
-- "Arrived" is set to true when they physically check in on tryout day.
-- Walk-ups are still supported — they get a new row with arrived=true directly.

-- ── tryout_checkins: add arrived flag, make tryout_number nullable ────────────

-- arrived=true  → player showed up (original behavior, all existing rows)
-- arrived=false → pre-assigned, not yet on site
alter table tryout_checkins
  add column if not exists arrived boolean not null default true;

-- tryout_number is now assigned at arrival, not at pre-assignment time
-- existing rows already have numbers, so this is safe
alter table tryout_checkins
  alter column tryout_number drop not null;

-- Prevent assigning the same player to the same session twice
-- (nulls in player_id are still allowed for write-ins)
-- Drop first so this is idempotent if constraint already exists.
alter table tryout_checkins
  drop constraint if exists tryout_checkins_session_player_key;
alter table tryout_checkins
  add constraint tryout_checkins_session_player_key
  unique (session_id, player_id);

-- ── tryout_registration_staging: capture preferred session date ───────────────
alter table tryout_registration_staging
  add column if not exists preferred_tryout_date date;

-- ── RLS: evaluators can read checkins (for scoring) ──────────────────────────
-- The existing policy only allows org_admin write. Evaluators already had
-- read access via tryout_checkins_member_read, which is sufficient.

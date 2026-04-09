-- ============================================================
-- Six43 – Migration 017: team member email + read-only flag
-- ============================================================

-- Store the accepting coach's email for display in settings
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS email text;

-- Allow owner to grant read-only access (cannot edit lineup/roster)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS read_only boolean NOT NULL DEFAULT false;

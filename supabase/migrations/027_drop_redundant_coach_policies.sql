-- ============================================================
-- Six43 – Migration 027: drop redundant coach RLS policies
-- ============================================================
-- Migration 009 (team_members) already grants FOR ALL access on
-- teams, seasons, games, players, lineup_slots, and pitcher_plans
-- to any accepted team member (which includes coaches).
--
-- Migrations 023 and 026 added overlapping SELECT / INSERT / UPDATE
-- policies for the same tables using get_my_coached_team_ids().
-- PostgreSQL evaluates ALL applicable policies per query with OR
-- logic, so each query now runs the coach sub-queries even though
-- migration 009 already passes — unnecessary work that grows with
-- team count and noticeably slows page loads.
--
-- Migration 025 (tournaments) is NOT dropped here — that table was
-- not covered by migration 009 and coaches genuinely need it.
-- ============================================================

-- ── From migration 023 ──────────────────────────────────────
DROP POLICY IF EXISTS "coaches read their teams"        ON teams;
DROP POLICY IF EXISTS "coaches read their seasons"      ON seasons;
DROP POLICY IF EXISTS "coaches read their games"        ON games;
DROP POLICY IF EXISTS "coaches read their players"      ON players;
DROP POLICY IF EXISTS "coaches read their lineup slots" ON lineup_slots;
DROP POLICY IF EXISTS "coaches read their pitcher plans" ON pitcher_plans;

-- ── From migration 026 ──────────────────────────────────────
DROP POLICY IF EXISTS "coaches insert lineup slots"     ON lineup_slots;
DROP POLICY IF EXISTS "coaches update lineup slots"     ON lineup_slots;
DROP POLICY IF EXISTS "coaches insert pitcher plans"    ON pitcher_plans;
DROP POLICY IF EXISTS "coaches update pitcher plans"    ON pitcher_plans;

-- ============================================================
-- Six43 – Migration 021: team staff visibility
-- ============================================================
-- Goals:
--   1. Store owner email on teams so coaches can see who the admin is
--   2. Allow team members to see ALL staff on their team (not just own row)
-- ============================================================

-- 1. owner_email on teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS owner_email text;

-- 2. Security-definer helper to avoid recursive RLS on team_members
--    Returns the owner_user_ids of all teams the current user has accepted into.
CREATE OR REPLACE FUNCTION public.get_my_owner_user_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_user_id
  FROM team_members
  WHERE user_id = auth.uid()
    AND accepted_at IS NOT NULL
$$;

-- 3. Replace the single FOR ALL policy with granular per-operation policies
--    so the SELECT clause can be broadened without loosening INSERT/UPDATE/DELETE.
DROP POLICY IF EXISTS "team member self or owner" ON team_members;

-- SELECT: owner sees all rows for their teams;
--         member sees own row + all rows for teams they've accepted into
CREATE POLICY "team_members_select"
  ON team_members FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR user_id = auth.uid()
    OR owner_user_id IN (SELECT public.get_my_owner_user_ids())
  );

-- INSERT: only the team owner can create invite rows
CREATE POLICY "team_members_insert"
  ON team_members FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

-- UPDATE: owner can update any row; member can update only their own
--         (accept endpoint uses service role, so this mainly guards client-side)
CREATE POLICY "team_members_update"
  ON team_members FOR UPDATE
  USING  (owner_user_id = auth.uid() OR user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- DELETE: only the team owner can remove members
CREATE POLICY "team_members_delete"
  ON team_members FOR DELETE
  USING (owner_user_id = auth.uid());

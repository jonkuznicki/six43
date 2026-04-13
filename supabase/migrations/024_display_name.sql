-- ============================================================
-- Six43 – Migration 024: display name on profiles
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;

-- Allow users to update their own profile (for display_name)
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow team members to read profiles of people on their teams
-- so staff lists can show display names
CREATE POLICY "profiles_select_team"
  ON profiles FOR SELECT
  USING (
    user_id IN (
      SELECT user_id FROM team_members
      WHERE team_id IN (
        SELECT id FROM teams WHERE user_id = auth.uid()
      )
      AND accepted_at IS NOT NULL
    )
    OR
    user_id IN (
      SELECT owner_user_id FROM team_members
      WHERE user_id = auth.uid()
      AND accepted_at IS NOT NULL
    )
  );

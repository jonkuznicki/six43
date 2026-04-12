-- ============================================================
-- Six43 – Migration 022: invite helper function
-- ============================================================
-- Lets the server look up an auth user ID by email without
-- exposing auth.users to the client.
-- SECURITY DEFINER so it can read auth.users with service role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM auth.users WHERE email = lower(user_email) LIMIT 1
$$;

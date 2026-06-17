-- ============================================================
-- Migration 005 — Auto-create public.users on auth.users insert
-- ============================================================
-- Problem: trips.user_id references public.users(id), but Supabase Auth
-- only creates rows in auth.users. If public.users row is missing,
-- any INSERT into trips fails with a FK violation.
--
-- Solution:
--   1. SECURITY DEFINER trigger function that mirrors auth.users → public.users
--   2. Backfill any existing auth users that are missing from public.users

-- ────────────────────────────────────────────────────────────
-- 1. Trigger function
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, auth_provider, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Attach trigger to auth.users
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ────────────────────────────────────────────────────────────
-- 3. Backfill existing auth users missing from public.users
-- ────────────────────────────────────────────────────────────

INSERT INTO public.users (id, email, name, auth_provider, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  COALESCE(au.raw_app_meta_data->>'provider', 'email'),
  au.created_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
);

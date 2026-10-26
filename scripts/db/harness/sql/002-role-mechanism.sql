-- Exercise real PostgreSQL role switching and auth.uid(), without service_role.
-- These synthetic claims are NOT real JWT/RLS integration evidence (G1-P03).
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$ BEGIN
  IF current_user <> 'authenticated' OR auth.uid() IS DISTINCT FROM
    '10000000-0000-4000-8000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Authenticated role/identity mechanism failed';
  END IF;
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Authenticated must not bypass RLS';
  END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  IF current_user <> 'anon' OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Anonymous role/identity mechanism failed';
  END IF;
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'Anonymous must not bypass RLS';
  END IF;
END $$;
ROLLBACK;

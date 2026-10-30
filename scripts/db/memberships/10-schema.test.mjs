export default async ({sql}) => {
try { sql(String.raw`DO $$
DECLARE t text; r text; p text; f record;
BEGIN
  IF (SELECT enabled FROM private.schema_capabilities WHERE name='trip_bootstrap_v1_ready') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Creation capability must remain false';
  END IF;
  FOREACH t IN ARRAY ARRAY['trips','travelers','trip_memberships'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) THEN RAISE EXCEPTION 'RLS missing'; END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(r,'public.'||t,p) IS DISTINCT FROM
           ((r='authenticated' AND p='SELECT') OR (r='service_role' AND p IN ('SELECT','INSERT','UPDATE','DELETE'))) THEN
          RAISE EXCEPTION 'Unexpected privilege table=% role=% operation=% actual=%',t,r,p,has_table_privilege(r,'public.'||t,p);
        END IF;
      END LOOP;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped
               AND (has_column_privilege('authenticated',attrelid,attnum,'INSERT') OR has_column_privilege('authenticated',attrelid,attnum,'UPDATE'))) THEN
      RAISE EXCEPTION 'Unexpected client column write privilege';
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t)<>1 OR
       EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t
               AND (cmd<>'SELECT' OR roles<>ARRAY['authenticated']::name[] OR qual NOT LIKE '%is_trip_member%')) THEN
      RAISE EXCEPTION 'Unexpected policy shape';
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated','private.schema_capabilities','SELECT') OR
     has_table_privilege('service_role','private.schema_capabilities','UPDATE') OR
     has_schema_privilege('anon','private','USAGE') THEN RAISE EXCEPTION 'Private capability exposed'; END IF;
  FOR f IN SELECT p.*, pg_get_userbyid(p.proowner) AS owner_name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('guard_trip_creation','bootstrap_trip_core','protect_trip_organizers','protect_contract_identity','trip_role','is_trip_member','can_converse') LOOP
    IF f.proconfig IS DISTINCT FROM ARRAY['search_path=""'] OR f.owner_name<>'postgres' THEN RAISE EXCEPTION 'Function owner/path mismatch'; END IF;
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Unexpected helper ACL'; END IF;
    IF has_function_privilege('authenticated',f.oid,'EXECUTE') IS DISTINCT FROM (f.proname IN ('trip_role','is_trip_member')) THEN RAISE EXCEPTION 'Unexpected authenticated function ACL'; END IF;
    IF EXISTS (SELECT 1 FROM aclexplode(f.proacl) WHERE grantee=0 AND privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC execute'; END IF;
    IF f.prosecdef IS DISTINCT FROM (f.proname IN ('guard_trip_creation','bootstrap_trip_core','protect_trip_organizers','trip_role')) THEN RAISE EXCEPTION 'Unexpected definer'; END IF;
    IF f.proname IN ('trip_role','is_trip_member','can_converse') AND f.provolatile<>'s' THEN RAISE EXCEPTION 'Unstable helper'; END IF;
  END LOOP;
  IF to_regprocedure('public.create_self_traveler()') IS NOT NULL OR EXISTS
     (SELECT 1 FROM pg_trigger WHERE tgrelid='public.trips'::regclass AND tgname='trg_create_self_traveler') THEN RAISE EXCEPTION 'Historical bootstrap retained'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.trips'::regclass AND NOT tgisinternal AND (tgtype & 4)=4)<>2 OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.trips'::regclass AND tgname='trg_00_guard_trip_creation' AND tgtype=7) OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.trips'::regclass AND tgname='trg_10_bootstrap_trip_core' AND tgtype=5) THEN RAISE EXCEPTION 'Bootstrap trigger shape/order'; END IF;
  -- Composite FK indexes must begin with ALL referencing columns in their order.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.contype='f' AND c.conrelid IN ('public.trips'::regclass,'public.travelers'::regclass,'public.trip_memberships'::regclass)
    AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid AND i.indisready AND i.indpred IS NULL
                    AND (i.indkey::smallint[])[0:cardinality(c.conkey)-1]=c.conkey)
  ) THEN RAISE EXCEPTION 'P03 foreign key lacks a complete leading index'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='trip_memberships' AND indexdef LIKE '%(user_id, status)%') OR
     NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='trip_memberships' AND indexdef LIKE '%(trip_id, role, status)%') THEN RAISE EXCEPTION 'RLS index missing'; END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version IN ('00000000000010','00000000000011','20260925172808')) THEN RAISE EXCEPTION 'Forbidden history'; END IF;
END;
$$;
`); } catch (error) {
const cause=String(error.stderr??'').match(/ERROR: ([^\r\n]+)/)?.[1]??'assertion';
console.error('[memberships:schema] FAIL: '+cause.replace(/"[^"]*"/g,'[identifier]').replace(/[A-Za-z0-9_@./:-]{20,}/g,'[redacted]'));
throw new Error('Schema assertion failed');
}
console.log('[memberships:schema] PASS: constraints, indexes, grants, RLS, owners, SECURITY DEFINER, search_path and ACL');
};

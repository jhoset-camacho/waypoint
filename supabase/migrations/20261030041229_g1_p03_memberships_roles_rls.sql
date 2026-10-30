-- G1-P03. Persistence/RLS 1.0.1; agent/application 1.0.0.
-- Atomic migration: drain earlier inserts BEFORE closing creation and backfilling.
BEGIN;
LOCK TABLE public.trips IN ACCESS EXCLUSIVE MODE;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE private.schema_capabilities (
    name text PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE private.schema_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.schema_capabilities FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.schema_capabilities(name, enabled) VALUES ('trip_bootstrap_v1_ready', false);

CREATE FUNCTION private.guard_trip_creation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT COALESCE((SELECT c.enabled FROM private.schema_capabilities AS c
                    WHERE c.name = 'trip_bootstrap_v1_ready'), false) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Trip creation is not ready';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_trip_creation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_00_guard_trip_creation BEFORE INSERT ON public.trips
FOR EACH ROW EXECUTE FUNCTION private.guard_trip_creation();

-- 001–009 has no trip-creation RPC. Fail closed if that baseline changes.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p
               JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.prokind = 'f'
               AND p.prosrc ~* 'insert\s+into\s+(public\.)?trips') THEN
        RAISE EXCEPTION 'Unexpected historical trip-creation function';
    END IF;
END;
$$;
REVOKE ALL ON public.trips, public.travelers FROM PUBLIC, anon, authenticated, service_role;
-- Remove column grants too, independently of historical table defaults.
DO $$
DECLARE t text; cols text;
BEGIN
    FOREACH t IN ARRAY ARRAY['trips', 'travelers'] LOOP
        SELECT pg_catalog.string_agg(pg_catalog.quote_ident(a.attname), ', ' ORDER BY a.attnum)
        INTO cols FROM pg_catalog.pg_attribute AS a
        WHERE a.attrelid = pg_catalog.to_regclass('public.' || t) AND a.attnum > 0 AND NOT a.attisdropped;
        EXECUTE pg_catalog.format('REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC, anon, authenticated, service_role', cols, cols, cols, cols, t);
    END LOOP;
END;
$$;

ALTER TABLE public.trips ADD COLUMN contract_id text;
ALTER TABLE public.travelers ADD COLUMN contract_id text;
UPDATE public.trips SET contract_id = 'trip_' || pg_catalog.replace(id::text, '-', '');
UPDATE public.travelers SET contract_id = 'person_' || pg_catalog.replace(id::text, '-', '');
ALTER TABLE public.trips
    ALTER COLUMN contract_id SET NOT NULL,
    ALTER COLUMN contract_id SET DEFAULT ('trip_' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')),
    ADD CONSTRAINT trips_contract_id_key UNIQUE (contract_id),
    ADD CONSTRAINT trips_contract_id_length CHECK (pg_catalog.char_length(contract_id) BETWEEN 1 AND 160);
ALTER TABLE public.travelers
    ALTER COLUMN contract_id SET NOT NULL,
    ALTER COLUMN contract_id SET DEFAULT ('person_' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '')),
    ADD CONSTRAINT travelers_contract_id_key UNIQUE (contract_id),
    ADD CONSTRAINT travelers_contract_id_length CHECK (pg_catalog.char_length(contract_id) BETWEEN 1 AND 160),
    ADD CONSTRAINT travelers_trip_id_id_key UNIQUE (trip_id, id);

CREATE FUNCTION private.protect_contract_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.id IS DISTINCT FROM OLD.id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Contract identity is immutable';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_contract_identity() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_contract_identity BEFORE UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION private.protect_contract_identity();
CREATE TRIGGER trg_contract_identity BEFORE UPDATE ON public.travelers
FOR EACH ROW EXECUTE FUNCTION private.protect_contract_identity();

CREATE TABLE public.trip_memberships (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    traveler_id uuid,
    role text NOT NULL CHECK (role IN ('organizer', 'participant', 'viewer')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
    removed_at timestamptz,
    CONSTRAINT trip_memberships_trip_user_key UNIQUE (trip_id, user_id),
    CONSTRAINT trip_memberships_trip_id_id_key UNIQUE (trip_id, id),
    CONSTRAINT trip_memberships_traveler_fkey FOREIGN KEY (trip_id, traveler_id)
        REFERENCES public.travelers(trip_id, id) ON DELETE RESTRICT,
    CONSTRAINT trip_memberships_active_traveler CHECK
        (status <> 'active' OR role = 'viewer' OR traveler_id IS NOT NULL),
    CONSTRAINT trip_memberships_removed_at CHECK ((status = 'removed') = (removed_at IS NOT NULL))
);
CREATE UNIQUE INDEX trip_memberships_trip_traveler_key ON public.trip_memberships(trip_id, traveler_id)
WHERE traveler_id IS NOT NULL;
CREATE INDEX trip_memberships_user_status_idx ON public.trip_memberships(user_id, status);
CREATE INDEX trip_memberships_trip_role_status_idx ON public.trip_memberships(trip_id, role, status);
CREATE INDEX trip_memberships_trip_traveler_fk_idx ON public.trip_memberships(trip_id, traveler_id);
CREATE INDEX trip_memberships_created_by_idx ON public.trip_memberships(created_by_user_id);
ALTER TABLE public.trip_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trip_memberships FROM PUBLIC, anon, authenticated, service_role;

-- Trips are already locked; lock travelers before choosing/backfilling self rows.
LOCK TABLE public.travelers IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE owner_row record; chosen uuid; duplicates bigint; trips_before bigint; travelers_before bigint;
BEGIN
    SELECT pg_catalog.count(*) INTO trips_before FROM public.trips;
    SELECT pg_catalog.count(*) INTO travelers_before FROM public.travelers;
    IF EXISTS (SELECT 1 FROM public.trips AS t LEFT JOIN public.users AS u ON u.id = t.user_id
               WHERE t.user_id IS NULL OR u.id IS NULL) THEN
        RAISE EXCEPTION 'Historical trip has no valid owner';
    END IF;
    FOR owner_row IN SELECT tr.id, tr.user_id, u.name FROM public.trips AS tr
             JOIN public.users AS u ON u.id = tr.user_id ORDER BY tr.id LOOP
        SELECT v.id INTO chosen FROM public.travelers AS v
        WHERE v.trip_id = owner_row.id AND v.role = 'self' ORDER BY v.created_at, v.id LIMIT 1;
        IF chosen IS NULL THEN
            -- Namespace-specific deterministic UUID; conflicting pre-existing IDs abort.
            chosen := pg_catalog.md5('gustave:p03:self:' || owner_row.id::text)::uuid;
            INSERT INTO public.travelers(id, trip_id, name, role, contract_id)
            VALUES (chosen, owner_row.id, COALESCE(owner_row.name, 'Viajero'), 'self',
                    'person_' || pg_catalog.replace(chosen::text, '-', ''));
        END IF;
        SELECT pg_catalog.count(*) - 1 INTO duplicates FROM public.travelers AS v
        WHERE v.trip_id = owner_row.id AND v.role = 'self';
        IF duplicates > 0 THEN
            RAISE NOTICE 'P03 duplicate self rows preserved: trip=%, chosen=%, extra=%', owner_row.id, chosen, duplicates;
        END IF;
        INSERT INTO public.trip_memberships(trip_id, user_id, traveler_id, role, created_by_user_id)
        VALUES (owner_row.id, owner_row.user_id, chosen, 'organizer', owner_row.user_id);
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.trips AS t LEFT JOIN public.trip_memberships AS m
               ON m.trip_id = t.id AND m.role = 'organizer' AND m.status = 'active'
               GROUP BY t.id HAVING pg_catalog.count(m.id) <> 1) THEN
        RAISE EXCEPTION 'Initial organizer backfill is incomplete';
    END IF;
    RAISE NOTICE 'P03 backfill trips before/after=%/%, travelers before/after=%/%, memberships=%',
        trips_before, (SELECT pg_catalog.count(*) FROM public.trips), travelers_before,
        (SELECT pg_catalog.count(*) FROM public.travelers), (SELECT pg_catalog.count(*) FROM public.trip_memberships);
END;
$$;
ALTER TABLE public.trips ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.trips DROP CONSTRAINT trips_user_id_fkey;
ALTER TABLE public.trips ADD CONSTRAINT trips_user_id_fkey FOREIGN KEY (user_id)
REFERENCES public.users(id) ON DELETE SET NULL;

CREATE FUNCTION private.protect_trip_organizers() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.trip_id IS DISTINCT FROM OLD.trip_id
           OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Membership identity is immutable';
        END IF;
        NEW.updated_at := pg_catalog.now();
    END IF;
    -- Updating the parent serializes administrative transitions. At repeatable read
    -- a stale competing transition raises serialization_failure instead of write skew.
    UPDATE public.trips SET updated_at = updated_at WHERE id = OLD.trip_id;
    IF FOUND AND OLD.role = 'organizer' AND OLD.status = 'active' THEN
        IF TG_OP = 'DELETE' OR NEW.role <> 'organizer' OR NEW.status <> 'active' THEN
            IF NOT EXISTS (SELECT 1 FROM public.trip_memberships AS m
                           WHERE m.trip_id = OLD.trip_id AND m.id <> OLD.id
                           AND m.role = 'organizer' AND m.status = 'active') THEN
                RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An active organizer is required';
            END IF;
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.protect_trip_organizers() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_protect_trip_organizers BEFORE UPDATE OR DELETE ON public.trip_memberships
FOR EACH ROW EXECUTE FUNCTION private.protect_trip_organizers();

CREATE FUNCTION private.trip_role(p_trip_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT m.role FROM public.trip_memberships AS m
    WHERE (SELECT auth.uid()) IS NOT NULL AND m.user_id = (SELECT auth.uid())
      AND m.trip_id = p_trip_id AND m.status = 'active';
$$;
CREATE FUNCTION private.is_trip_member(p_trip_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT (SELECT auth.uid()) IS NOT NULL AND private.trip_role(p_trip_id) IS NOT NULL;
$$;
CREATE FUNCTION private.can_converse(p_trip_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
    SELECT (SELECT auth.uid()) IS NOT NULL AND COALESCE(private.trip_role(p_trip_id) IN ('organizer', 'participant'), false);
$$;
REVOKE ALL ON FUNCTION private.trip_role(uuid), private.is_trip_member(uuid), private.can_converse(uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.trip_role(uuid), private.is_trip_member(uuid) TO authenticated;
-- can_converse is reserved for P04; no client execute grant before its consumer.

DROP POLICY trips_select_own ON public.trips;
DROP POLICY trips_insert_own ON public.trips;
DROP POLICY trips_update_own ON public.trips;
DROP POLICY trips_delete_own ON public.trips;
DROP POLICY travelers_all ON public.travelers;
CREATE POLICY trips_select_member ON public.trips FOR SELECT TO authenticated
USING ((SELECT private.is_trip_member(id)));
CREATE POLICY travelers_select_member ON public.travelers FOR SELECT TO authenticated
USING ((SELECT private.is_trip_member(trip_id)));
CREATE POLICY memberships_select_member ON public.trip_memberships FOR SELECT TO authenticated
USING ((SELECT private.is_trip_member(trip_id)));
GRANT SELECT ON public.trips, public.travelers, public.trip_memberships TO authenticated;
-- Keep the historical predicate for untouched legacy policies, but let trips RLS
-- enforce active membership even for that compatibility path. It must not be a
-- SECURITY DEFINER oracle for a removed legacy creator. No new legacy grants.
CREATE OR REPLACE FUNCTION public.is_trip_owner(p_trip_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT EXISTS (SELECT 1 FROM public.trips AS t
                   WHERE t.id = p_trip_id AND t.user_id = (SELECT auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.is_trip_owner(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;

-- Explicit administrative fixture/service operations; no TRUNCATE/REFERENCES/TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trips, public.travelers, public.trip_memberships TO service_role;

DROP TRIGGER trg_create_self_traveler ON public.trips;
REVOKE ALL ON FUNCTION public.create_self_traveler() FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.create_self_traveler();
CREATE FUNCTION private.bootstrap_trip_core() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE person_id uuid; actor uuid := (SELECT auth.uid());
BEGIN
    IF actor IS NULL OR NEW.user_id IS DISTINCT FROM actor THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Trip creator identity is required';
    END IF;
    person_id := pg_catalog.md5('gustave:p03:self:' || NEW.id::text)::uuid;
    INSERT INTO public.travelers(id, trip_id, name, role, contract_id)
    SELECT person_id, NEW.id, COALESCE(u.name, 'Viajero'), 'self',
           'person_' || pg_catalog.replace(person_id::text, '-', '')
    FROM public.users AS u WHERE u.id = actor
    ON CONFLICT (trip_id, id) DO NOTHING;
    INSERT INTO public.trip_memberships(trip_id, user_id, traveler_id, role, created_by_user_id)
    VALUES (NEW.id, actor, person_id, 'organizer', actor)
    ON CONFLICT (trip_id, user_id) DO NOTHING;
    IF (SELECT pg_catalog.count(*) FROM public.travelers AS v WHERE v.trip_id = NEW.id AND v.role = 'self') <> 1
       OR NOT EXISTS (SELECT 1 FROM public.trip_memberships AS m WHERE m.trip_id = NEW.id
                      AND m.user_id = actor AND m.traveler_id = person_id AND m.role = 'organizer' AND m.status = 'active') THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Trip core is incomplete';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.bootstrap_trip_core() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_10_bootstrap_trip_core AFTER INSERT ON public.trips
FOR EACH ROW EXECUTE FUNCTION private.bootstrap_trip_core();
-- P06 alone may publish capability and column INSERT grant together.
COMMIT;

-- Baseline reconstruction only; not the future V1 authorization matrix.
BEGIN;
DO $$
DECLARE versions text[];
BEGIN
  SELECT array_agg(version ORDER BY version) INTO versions
  FROM supabase_migrations.schema_migrations;
  IF versions IS DISTINCT FROM ARRAY[
    '00000000000001','00000000000002','00000000000003',
    '00000000000004','00000000000005','00000000000006',
    '00000000000007','00000000000008','00000000000009'
  ] THEN RAISE EXCEPTION 'Expected migration history 001–009'; END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public') <> 15 THEN
    RAISE EXCEPTION 'Expected 15 historical public tables';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity) THEN
    RAISE EXCEPTION 'Historical public tables must enable RLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='trips' AND column_name='mood_tags') THEN
    RAISE EXCEPTION 'Migration 006 missing';
  END IF;
  IF (SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime'
    AND schemaname='public' AND tablename IN
    ('messages','suggestions','itinerary_days','itinerary_items','travel_matrix')) <> 5 THEN
    RAISE EXCEPTION 'Realtime migrations 007–008 missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='idx_places_trip_google_place_id'
    AND indexdef LIKE 'CREATE UNIQUE INDEX%WHERE (google_place_id IS NOT NULL)') THEN
    RAISE EXCEPTION 'Migration 009 partial unique index missing';
  END IF;
END $$;
ROLLBACK;

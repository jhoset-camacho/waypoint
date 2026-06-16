-- ============================================================
-- Waypoint — RLS Policies + Storage Bucket
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ENABLE RLS ON ALL TABLES
-- ────────────────────────────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_matrix ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 2. POLICIES: users
-- ────────────────────────────────────────────────────────────

CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_insert_own" ON users
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 3. POLICIES: trips (owner only)
-- ────────────────────────────────────────────────────────────

CREATE POLICY "trips_select_own" ON trips
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "trips_insert_own" ON trips
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "trips_update_own" ON trips
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "trips_delete_own" ON trips
    FOR DELETE USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 4. HELPER: check trip ownership via trip_id
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_trip_owner(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM trips WHERE id = p_trip_id AND user_id = auth.uid()
    );
$$;

-- ────────────────────────────────────────────────────────────
-- 5. POLICIES: tables with direct trip_id
-- ────────────────────────────────────────────────────────────

-- travelers
CREATE POLICY "travelers_all" ON travelers
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- trip_context
CREATE POLICY "trip_context_all" ON trip_context
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- messages
CREATE POLICY "messages_all" ON messages
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- attachments
CREATE POLICY "attachments_all" ON attachments
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- places
CREATE POLICY "places_all" ON places
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- itinerary_days
CREATE POLICY "itinerary_days_all" ON itinerary_days
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- suggestions
CREATE POLICY "suggestions_all" ON suggestions
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- trip_notes
CREATE POLICY "trip_notes_all" ON trip_notes
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- travel_matrix
CREATE POLICY "travel_matrix_all" ON travel_matrix
    FOR ALL USING (is_trip_owner(trip_id)) WITH CHECK (is_trip_owner(trip_id));

-- ────────────────────────────────────────────────────────────
-- 6. POLICIES: tables without direct trip_id (via parent)
-- ────────────────────────────────────────────────────────────

-- place_notes → places.trip_id
CREATE POLICY "place_notes_all" ON place_notes
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM places
            WHERE places.id = place_notes.place_id
              AND is_trip_owner(places.trip_id)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM places
            WHERE places.id = place_notes.place_id
              AND is_trip_owner(places.trip_id)
        )
    );

-- place_travelers → places.trip_id
CREATE POLICY "place_travelers_all" ON place_travelers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM places
            WHERE places.id = place_travelers.place_id
              AND is_trip_owner(places.trip_id)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM places
            WHERE places.id = place_travelers.place_id
              AND is_trip_owner(places.trip_id)
        )
    );

-- itinerary_items → itinerary_days.trip_id
CREATE POLICY "itinerary_items_all" ON itinerary_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM itinerary_days
            WHERE itinerary_days.id = itinerary_items.day_id
              AND is_trip_owner(itinerary_days.trip_id)
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM itinerary_days
            WHERE itinerary_days.id = itinerary_items.day_id
              AND is_trip_owner(itinerary_days.trip_id)
        )
    );

-- ────────────────────────────────────────────────────────────
-- 7. STORAGE: attachments bucket
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false);

-- Upload: user can upload to their own path {user_id}/{trip_id}/...
CREATE POLICY "attachments_upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = auth.uid()::text
        AND is_trip_owner(((storage.foldername(name))[2])::uuid)
    );

-- Read: user can read their own files
CREATE POLICY "attachments_read" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Delete: user can delete their own files
CREATE POLICY "attachments_delete" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'attachments'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

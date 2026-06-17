-- ============================================================
-- F1 — Events table, auto-traveler trigger, realtime setup
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. EVENTS TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
    trip_id     uuid REFERENCES trips(id) ON DELETE CASCADE,
    name        text NOT NULL,
    props_json  jsonb DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_trip_id ON events(trip_id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_select_own" ON events
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "events_insert_own" ON events
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- 2. AUTO-CREATE TRAVELER "self" WHEN A TRIP IS CREATED
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_self_traveler()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_name text;
BEGIN
    SELECT name INTO v_user_name FROM users WHERE id = NEW.user_id;

    INSERT INTO travelers (trip_id, name, role)
    VALUES (NEW.id, COALESCE(v_user_name, 'Viajero'), 'self');

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_self_traveler
    AFTER INSERT ON trips
    FOR EACH ROW
    EXECUTE FUNCTION create_self_traveler();

-- ────────────────────────────────────────────────────────────
-- 3. ENABLE REALTIME ON MESSAGES
-- ────────────────────────────────────────────────────────────

ALTER TABLE messages REPLICA IDENTITY FULL;

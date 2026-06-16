-- ============================================================
-- Waypoint — Initial Schema
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ────────────────────────────────────────────────────────────

CREATE TYPE trip_status AS ENUM ('draft', 'active', 'inactive', 'archived');
CREATE TYPE planning_mode AS ENUM ('route', 'checklist', 'hybrid');
CREATE TYPE traveler_role AS ENUM ('self', 'partner', 'family', 'child', 'friend');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE attachment_type AS ENUM ('image', 'link', 'file', 'note');
CREATE TYPE place_type AS ENUM ('stay', 'pass_photo', 'restaurant', 'shop', 'transport', 'hotel', 'logistic_note');
CREATE TYPE place_status AS ENUM ('suggested', 'approved', 'rejected', 'planned', 'visited', 'saved_for_later');
CREATE TYPE place_relevance AS ENUM ('shared', 'individual');
CREATE TYPE day_block AS ENUM ('morning', 'afternoon', 'evening');
CREATE TYPE itinerary_mode AS ENUM ('route', 'checklist');
CREATE TYPE itinerary_item_status AS ENUM ('draft', 'confirmed', 'manual_locked', 'removed');
CREATE TYPE suggestion_status AS ENUM ('pending', 'approved', 'rejected', 'applied', 'superseded');
CREATE TYPE place_note_type AS ENUM ('tip', 'warning', 'logistics', 'general');

-- ────────────────────────────────────────────────────────────
-- 2. TABLES
-- ────────────────────────────────────────────────────────────

-- users ──────────────────────────────────────────────────────
CREATE TABLE users (
    id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       text NOT NULL,
    name        text,
    auth_provider text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- trips ──────────────────────────────────────────────────────
CREATE TABLE trips (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         text NOT NULL,
    destination   text,
    start_date    date,
    end_date      date,
    status        trip_status NOT NULL DEFAULT 'draft',
    planning_mode planning_mode NOT NULL DEFAULT 'hybrid',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trips_user_id ON trips(user_id);

-- travelers ──────────────────────────────────────────────────
CREATE TABLE travelers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name            text NOT NULL,
    role            traveler_role NOT NULL DEFAULT 'self',
    style_summary   text,
    constraints_json jsonb DEFAULT '{}',
    color           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_travelers_trip_id ON travelers(trip_id);

-- trip_context ────────────────────────────────────────────────
CREATE TABLE trip_context (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id           uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    key               text NOT NULL,
    value_json        jsonb NOT NULL,
    source_message_id uuid,
    confidence        real,
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_context_trip_id ON trip_context(trip_id);
CREATE UNIQUE INDEX idx_trip_context_trip_key ON trip_context(trip_id, key);

-- messages ────────────────────────────────────────────────────
CREATE TABLE messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
    role        message_role NOT NULL,
    content     text NOT NULL,
    attachments_json jsonb DEFAULT '[]',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_trip_id ON messages(trip_id);
CREATE INDEX idx_messages_created_at ON messages(trip_id, created_at);

-- attachments ─────────────────────────────────────────────────
CREATE TABLE attachments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    message_id      uuid REFERENCES messages(id) ON DELETE SET NULL,
    type            attachment_type NOT NULL,
    storage_path    text NOT NULL,
    extracted_text  text,
    metadata_json   jsonb DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_trip_id ON attachments(trip_id);

-- places ──────────────────────────────────────────────────────
CREATE TABLE places (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id           uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    name              text NOT NULL,
    type              place_type NOT NULL,
    status            place_status NOT NULL DEFAULT 'suggested',
    priority          int,
    lat               double precision,
    lng               double precision,
    address           text,
    google_place_id   text,
    source            text,
    confidence        real,
    opening_hours_json jsonb,
    metadata_json     jsonb DEFAULT '{}',
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_places_trip_id ON places(trip_id);
CREATE INDEX idx_places_status ON places(trip_id, status);

-- place_notes ─────────────────────────────────────────────────
CREATE TABLE place_notes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    note_type   place_note_type NOT NULL DEFAULT 'general',
    content     text NOT NULL,
    source      text,
    confidence  real
);

CREATE INDEX idx_place_notes_place_id ON place_notes(place_id);

-- place_travelers ─────────────────────────────────────────────
CREATE TABLE place_travelers (
    place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    traveler_id uuid NOT NULL REFERENCES travelers(id) ON DELETE CASCADE,
    relevance   place_relevance NOT NULL DEFAULT 'shared',
    PRIMARY KEY (place_id, traveler_id)
);

-- itinerary_days ──────────────────────────────────────────────
CREATE TABLE itinerary_days (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id     uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    date        date NOT NULL,
    label       text,
    notes       text,
    weather_json jsonb
);

CREATE INDEX idx_itinerary_days_trip_id ON itinerary_days(trip_id);
CREATE UNIQUE INDEX idx_itinerary_days_trip_date ON itinerary_days(trip_id, date);

-- itinerary_items ─────────────────────────────────────────────
CREATE TABLE itinerary_items (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id                  uuid NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
    place_id                uuid REFERENCES places(id) ON DELETE SET NULL,
    start_time              time,
    end_time                time,
    block                   day_block,
    order_index             int NOT NULL DEFAULT 0,
    mode                    itinerary_mode NOT NULL DEFAULT 'route',
    participants_json       jsonb DEFAULT '[]',
    notes                   text,
    travel_minutes_from_prev int,
    locked_by_user          boolean NOT NULL DEFAULT false,
    status                  itinerary_item_status NOT NULL DEFAULT 'draft',
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_itinerary_items_day_id ON itinerary_items(day_id);

-- suggestions ─────────────────────────────────────────────────
CREATE TABLE suggestions (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id                 uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    type                    text NOT NULL,
    payload_json            jsonb NOT NULL,
    status                  suggestion_status NOT NULL DEFAULT 'pending',
    created_from_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
    applied_at              timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suggestions_trip_id ON suggestions(trip_id);
CREATE INDEX idx_suggestions_status ON suggestions(trip_id, status);

-- trip_notes ──────────────────────────────────────────────────
CREATE TABLE trip_notes (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id          uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    day_id           uuid REFERENCES itinerary_days(id) ON DELETE SET NULL,
    title            text,
    content_markdown text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trip_notes_trip_id ON trip_notes(trip_id);

-- travel_matrix ───────────────────────────────────────────────
CREATE TABLE travel_matrix (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id          uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    origin_place_id  uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    dest_place_id    uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    minutes          int NOT NULL,
    mode             text NOT NULL,
    computed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_travel_matrix_trip_id ON travel_matrix(trip_id);
CREATE UNIQUE INDEX idx_travel_matrix_pair ON travel_matrix(trip_id, origin_place_id, dest_place_id, mode);

-- ────────────────────────────────────────────────────────────
-- 3. updated_at TRIGGER
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trips_updated_at
    BEFORE UPDATE ON trips
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_places_updated_at
    BEFORE UPDATE ON places
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_trip_context_updated_at
    BEFORE UPDATE ON trip_context
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_trip_notes_updated_at
    BEFORE UPDATE ON trip_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

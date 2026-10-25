-- Deduplicate places by (trip_id, google_place_id) and prevent future duplicates.
--
-- Bug: adding/approving the same place twice created repeated rows in `places`
-- (e.g. "Usurum" x3), polluting the map and the itinerary.
--
-- Strategy:
--   1. Normalize empty google_place_id to NULL.
--   2. Pick one survivor per (trip_id, google_place_id): most advanced status wins,
--      oldest row breaks ties.
--   3. Move the richest data and every child row onto the survivor, drop the rest.
--   4. Add a partial unique index so it cannot happen again.

-- ── 0. Normalize ─────────────────────────────────────────────
UPDATE places SET google_place_id = NULL WHERE google_place_id = '';

-- ── 1. Map every duplicate row to its survivor ───────────────
CREATE TEMPORARY TABLE place_dupe_map AS
WITH ranked AS (
    SELECT
        id,
        row_number()    OVER w AS rn,
        first_value(id) OVER w AS keeper_id
    FROM places
    WHERE google_place_id IS NOT NULL
    WINDOW w AS (
        PARTITION BY trip_id, google_place_id
        ORDER BY
            CASE status::text
                WHEN 'visited'         THEN 1
                WHEN 'planned'         THEN 2
                WHEN 'approved'        THEN 3
                WHEN 'saved_for_later' THEN 4
                WHEN 'suggested'       THEN 5
                WHEN 'rejected'        THEN 6
                ELSE 7
            END,
            created_at,
            id
    )
)
SELECT id AS dup_id, keeper_id
FROM ranked
WHERE rn > 1;

-- ── 2. Carry the richest data over to the survivor ───────────
-- Coordinates/address/hours describe the same Google place in every duplicate,
-- so the most recently updated duplicate that has them is good enough.
WITH best AS (
    SELECT DISTINCT ON (m.keeper_id)
        m.keeper_id, d.lat, d.lng, d.address, d.opening_hours_json
    FROM place_dupe_map m
    JOIN places d ON d.id = m.dup_id
    WHERE d.lat IS NOT NULL AND d.lng IS NOT NULL
    ORDER BY m.keeper_id, d.updated_at DESC
)
UPDATE places k
SET lat                = coalesce(k.lat, b.lat),
    lng                = coalesce(k.lng, b.lng),
    address            = coalesce(k.address, b.address),
    opening_hours_json = coalesce(k.opening_hours_json, b.opening_hours_json),
    updated_at         = now()
FROM best b
WHERE k.id = b.keeper_id;

-- Keep the highest priority seen across the duplicates (1 = must … 4 = passby).
WITH prio AS (
    SELECT m.keeper_id, min(coalesce(d.priority, 4)) AS priority
    FROM place_dupe_map m
    JOIN places d ON d.id = m.dup_id
    GROUP BY m.keeper_id
)
UPDATE places k
SET priority = least(coalesce(k.priority, 4), p.priority)
FROM prio p
WHERE k.id = p.keeper_id;

-- ── 3. Repoint children, then drop the duplicates ────────────
UPDATE itinerary_items i
SET place_id = m.keeper_id
FROM place_dupe_map m
WHERE i.place_id = m.dup_id;

UPDATE place_notes n
SET place_id = m.keeper_id
FROM place_dupe_map m
WHERE n.place_id = m.dup_id;

-- Traveler links that would collide with an existing one are dropped by the cascade below.
UPDATE place_travelers pt
SET place_id = m.keeper_id
FROM place_dupe_map m
WHERE pt.place_id = m.dup_id
  AND NOT EXISTS (
      SELECT 1 FROM place_travelers x
      WHERE x.place_id = m.keeper_id AND x.traveler_id = pt.traveler_id
  );

-- travel_matrix rows pointing at a duplicate are cached travel times; they are
-- recomputed on the next itinerary update, so the cascade may take them.
DELETE FROM places p
USING place_dupe_map m
WHERE p.id = m.dup_id;

DROP TABLE place_dupe_map;

-- ── 4. Prevent future duplicates ─────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_places_trip_google_place_id
    ON places (trip_id, google_place_id)
    WHERE google_place_id IS NOT NULL;

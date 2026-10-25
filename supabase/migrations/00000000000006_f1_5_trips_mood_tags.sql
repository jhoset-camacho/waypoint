-- ============================================================
-- Migration 006 — F1.5: trips.mood_tags
-- ============================================================
-- Context:
--   F1.5 "Pocket Shell + crear pocket flexible" introduces an optional
--   mood chip selection when creating a trip.
--   destination, start_date, end_date are already nullable (verified).
--   This migration only adds the new mood_tags column.
--
-- Acceptance criteria:
--   A trip can be inserted with only `title`; all other fields null.
--   mood_tags accepts any subset of: comida, cultura, relax,
--   aventura, naturaleza, fiesta (enforced in app, not at DB level).
-- ============================================================

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS mood_tags text[] NULL DEFAULT NULL;

COMMENT ON COLUMN trips.mood_tags IS
  'Optional mood chips selected when creating a pocket. '
  'Values: comida, cultura, relax, aventura, naturaleza, fiesta.';

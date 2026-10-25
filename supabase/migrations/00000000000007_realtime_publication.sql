-- ============================================================
-- Fix — Add tables to the supabase_realtime publication so
-- INSERT/UPDATE events are actually broadcast to clients.
-- Migration 004 set REPLICA IDENTITY FULL on messages but never
-- added it to the publication, so realtime never fired.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'suggestions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE suggestions;
  END IF;
END $$;

-- Ensure full row payloads for realtime (needed for updates/deletes).
ALTER TABLE suggestions REPLICA IDENTITY FULL;

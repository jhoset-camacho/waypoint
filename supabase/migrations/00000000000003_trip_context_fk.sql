-- Add missing FK: trip_context.source_message_id → messages(id)
ALTER TABLE trip_context
  ADD CONSTRAINT trip_context_source_message_id_fkey
  FOREIGN KEY (source_message_id)
  REFERENCES messages(id)
  ON DELETE SET NULL;

-- F4: Add itinerary tables to realtime publication
-- itinerary_days and itinerary_items were missing from the publication.

ALTER PUBLICATION supabase_realtime ADD TABLE itinerary_days;
ALTER PUBLICATION supabase_realtime ADD TABLE itinerary_items;
ALTER PUBLICATION supabase_realtime ADD TABLE travel_matrix;

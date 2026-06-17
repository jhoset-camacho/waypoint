import { Database } from '@/supabase/types/database';

export type { Database } from '@/supabase/types/database';

type Tables = Database['public']['Tables'];

export type Trip = Tables['trips']['Row'];
export type TripInsert = Tables['trips']['Insert'];
export type User = Tables['users']['Row'];
export type Message = Tables['messages']['Row'];
export type MessageInsert = Tables['messages']['Insert'];
export type Place = Tables['places']['Row'];
export type Traveler = Tables['travelers']['Row'];
export type Suggestion = Tables['suggestions']['Row'];
export type ItineraryDay = Tables['itinerary_days']['Row'];
export type ItineraryItem = Tables['itinerary_items']['Row'];
export type TripNote = Tables['trip_notes']['Row'];
export type Attachment = Tables['attachments']['Row'];
export type TripContext = Tables['trip_context']['Row'];
export type Event = Tables['events']['Row'];

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string
          extracted_text: string | null
          id: string
          message_id: string | null
          metadata_json: Json | null
          storage_path: string
          trip_id: string
          type: Database["public"]["Enums"]["attachment_type"]
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          id?: string
          message_id?: string | null
          metadata_json?: Json | null
          storage_path: string
          trip_id: string
          type: Database["public"]["Enums"]["attachment_type"]
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          id?: string
          message_id?: string | null
          metadata_json?: Json | null
          storage_path?: string
          trip_id?: string
          type?: Database["public"]["Enums"]["attachment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_days: {
        Row: {
          date: string
          id: string
          label: string | null
          notes: string | null
          trip_id: string
          weather_json: Json | null
        }
        Insert: {
          date: string
          id?: string
          label?: string | null
          notes?: string | null
          trip_id: string
          weather_json?: Json | null
        }
        Update: {
          date?: string
          id?: string
          label?: string | null
          notes?: string | null
          trip_id?: string
          weather_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      itinerary_items: {
        Row: {
          block: Database["public"]["Enums"]["day_block"] | null
          created_at: string
          day_id: string
          end_time: string | null
          id: string
          locked_by_user: boolean
          mode: Database["public"]["Enums"]["itinerary_mode"]
          notes: string | null
          order_index: number
          participants_json: Json | null
          place_id: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["itinerary_item_status"]
          travel_minutes_from_prev: number | null
        }
        Insert: {
          block?: Database["public"]["Enums"]["day_block"] | null
          created_at?: string
          day_id: string
          end_time?: string | null
          id?: string
          locked_by_user?: boolean
          mode?: Database["public"]["Enums"]["itinerary_mode"]
          notes?: string | null
          order_index?: number
          participants_json?: Json | null
          place_id?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["itinerary_item_status"]
          travel_minutes_from_prev?: number | null
        }
        Update: {
          block?: Database["public"]["Enums"]["day_block"] | null
          created_at?: string
          day_id?: string
          end_time?: string | null
          id?: string
          locked_by_user?: boolean
          mode?: Database["public"]["Enums"]["itinerary_mode"]
          notes?: string | null
          order_index?: number
          participants_json?: Json | null
          place_id?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["itinerary_item_status"]
          travel_minutes_from_prev?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachments_json: Json | null
          content: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["message_role"]
          trip_id: string
          user_id: string | null
        }
        Insert: {
          attachments_json?: Json | null
          content: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["message_role"]
          trip_id: string
          user_id?: string | null
        }
        Update: {
          attachments_json?: Json | null
          content?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["message_role"]
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      place_notes: {
        Row: {
          confidence: number | null
          content: string
          id: string
          note_type: Database["public"]["Enums"]["place_note_type"]
          place_id: string
          source: string | null
        }
        Insert: {
          confidence?: number | null
          content: string
          id?: string
          note_type?: Database["public"]["Enums"]["place_note_type"]
          place_id: string
          source?: string | null
        }
        Update: {
          confidence?: number | null
          content?: string
          id?: string
          note_type?: Database["public"]["Enums"]["place_note_type"]
          place_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_notes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      place_travelers: {
        Row: {
          place_id: string
          relevance: Database["public"]["Enums"]["place_relevance"]
          traveler_id: string
        }
        Insert: {
          place_id: string
          relevance?: Database["public"]["Enums"]["place_relevance"]
          traveler_id: string
        }
        Update: {
          place_id?: string
          relevance?: Database["public"]["Enums"]["place_relevance"]
          traveler_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_travelers_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_travelers_traveler_id_fkey"
            columns: ["traveler_id"]
            isOneToOne: false
            referencedRelation: "travelers"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          address: string | null
          confidence: number | null
          created_at: string
          google_place_id: string | null
          id: string
          lat: number | null
          lng: number | null
          metadata_json: Json | null
          name: string
          opening_hours_json: Json | null
          priority: number | null
          source: string | null
          status: Database["public"]["Enums"]["place_status"]
          trip_id: string
          type: Database["public"]["Enums"]["place_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          confidence?: number | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          metadata_json?: Json | null
          name: string
          opening_hours_json?: Json | null
          priority?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["place_status"]
          trip_id: string
          type: Database["public"]["Enums"]["place_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          confidence?: number | null
          created_at?: string
          google_place_id?: string | null
          id?: string
          lat?: number | null
          lng?: number | null
          metadata_json?: Json | null
          name?: string
          opening_hours_json?: Json | null
          priority?: number | null
          source?: string | null
          status?: Database["public"]["Enums"]["place_status"]
          trip_id?: string
          type?: Database["public"]["Enums"]["place_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          applied_at: string | null
          created_at: string
          created_from_message_id: string | null
          id: string
          payload_json: Json
          status: Database["public"]["Enums"]["suggestion_status"]
          trip_id: string
          type: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_from_message_id?: string | null
          id?: string
          payload_json: Json
          status?: Database["public"]["Enums"]["suggestion_status"]
          trip_id: string
          type: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_from_message_id?: string | null
          id?: string
          payload_json?: Json
          status?: Database["public"]["Enums"]["suggestion_status"]
          trip_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_created_from_message_id_fkey"
            columns: ["created_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_matrix: {
        Row: {
          computed_at: string
          dest_place_id: string
          id: string
          minutes: number
          mode: string
          origin_place_id: string
          trip_id: string
        }
        Insert: {
          computed_at?: string
          dest_place_id: string
          id?: string
          minutes: number
          mode: string
          origin_place_id: string
          trip_id: string
        }
        Update: {
          computed_at?: string
          dest_place_id?: string
          id?: string
          minutes?: number
          mode?: string
          origin_place_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_matrix_dest_place_id_fkey"
            columns: ["dest_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_matrix_origin_place_id_fkey"
            columns: ["origin_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_matrix_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      travelers: {
        Row: {
          color: string | null
          constraints_json: Json | null
          created_at: string
          id: string
          name: string
          role: Database["public"]["Enums"]["traveler_role"]
          style_summary: string | null
          trip_id: string
        }
        Insert: {
          color?: string | null
          constraints_json?: Json | null
          created_at?: string
          id?: string
          name: string
          role?: Database["public"]["Enums"]["traveler_role"]
          style_summary?: string | null
          trip_id: string
        }
        Update: {
          color?: string | null
          constraints_json?: Json | null
          created_at?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["traveler_role"]
          style_summary?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travelers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_context: {
        Row: {
          confidence: number | null
          id: string
          key: string
          source_message_id: string | null
          trip_id: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          confidence?: number | null
          id?: string
          key: string
          source_message_id?: string | null
          trip_id: string
          updated_at?: string
          value_json: Json
        }
        Update: {
          confidence?: number | null
          id?: string
          key?: string
          source_message_id?: string | null
          trip_id?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "trip_context_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_context_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_notes: {
        Row: {
          content_markdown: string | null
          created_at: string
          day_id: string | null
          id: string
          title: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          content_markdown?: string | null
          created_at?: string
          day_id?: string | null
          id?: string
          title?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          content_markdown?: string | null
          created_at?: string
          day_id?: string | null
          id?: string
          title?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_notes_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "itinerary_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_notes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          destination: string | null
          end_date: string | null
          id: string
          planning_mode: Database["public"]["Enums"]["planning_mode"]
          start_date: string | null
          status: Database["public"]["Enums"]["trip_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          end_date?: string | null
          id?: string
          planning_mode?: Database["public"]["Enums"]["planning_mode"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          end_date?: string | null
          id?: string
          planning_mode?: Database["public"]["Enums"]["planning_mode"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_provider: string | null
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          auth_provider?: string | null
          created_at?: string
          email: string
          id: string
          name?: string | null
        }
        Update: {
          auth_provider?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_trip_owner: { Args: { p_trip_id: string }; Returns: boolean }
    }
    Enums: {
      attachment_type: "image" | "link" | "file" | "note"
      day_block: "morning" | "afternoon" | "evening"
      itinerary_item_status: "draft" | "confirmed" | "manual_locked" | "removed"
      itinerary_mode: "route" | "checklist"
      message_role: "user" | "assistant" | "system"
      place_note_type: "tip" | "warning" | "logistics" | "general"
      place_relevance: "shared" | "individual"
      place_status:
        | "suggested"
        | "approved"
        | "rejected"
        | "planned"
        | "visited"
        | "saved_for_later"
      place_type:
        | "stay"
        | "pass_photo"
        | "restaurant"
        | "shop"
        | "transport"
        | "hotel"
        | "logistic_note"
      planning_mode: "route" | "checklist" | "hybrid"
      suggestion_status:
        | "pending"
        | "approved"
        | "rejected"
        | "applied"
        | "superseded"
      traveler_role: "self" | "partner" | "family" | "child" | "friend"
      trip_status: "draft" | "active" | "inactive" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attachment_type: ["image", "link", "file", "note"],
      day_block: ["morning", "afternoon", "evening"],
      itinerary_item_status: ["draft", "confirmed", "manual_locked", "removed"],
      itinerary_mode: ["route", "checklist"],
      message_role: ["user", "assistant", "system"],
      place_note_type: ["tip", "warning", "logistics", "general"],
      place_relevance: ["shared", "individual"],
      place_status: [
        "suggested",
        "approved",
        "rejected",
        "planned",
        "visited",
        "saved_for_later",
      ],
      place_type: [
        "stay",
        "pass_photo",
        "restaurant",
        "shop",
        "transport",
        "hotel",
        "logistic_note",
      ],
      planning_mode: ["route", "checklist", "hybrid"],
      suggestion_status: [
        "pending",
        "approved",
        "rejected",
        "applied",
        "superseded",
      ],
      traveler_role: ["self", "partner", "family", "child", "friend"],
      trip_status: ["draft", "active", "inactive", "archived"],
    },
  },
} as const

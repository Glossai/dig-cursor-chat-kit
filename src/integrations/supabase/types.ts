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
  public: {
    Tables: {
      cursor_messages: {
        Row: {
          agent_name: string
          completed_at: string | null
          content: string
          created_at: string
          cursor_run_id: string | null
          error_code: string | null
          error_message: string | null
          id: string
          role: string
          status: string
          thread_id: string
          user_id: string
        }
        Insert: {
          agent_name: string
          completed_at?: string | null
          content?: string
          created_at?: string
          cursor_run_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          role: string
          status?: string
          thread_id: string
          user_id: string
        }
        Update: {
          agent_name?: string
          completed_at?: string | null
          content?: string
          created_at?: string
          cursor_run_id?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          role?: string
          status?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cursor_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "cursor_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      cursor_runs: {
        Row: {
          agent_name: string
          assistant_message_id: string
          cache_read_cost_micros: number | null
          cache_read_tokens: number | null
          cache_write_cost_micros: number | null
          cache_write_tokens: number | null
          cost_currency: string
          cost_source: string
          created_at: string
          cursor_agent_id: string
          cursor_run_id: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          input_cost_micros: number | null
          input_tokens: number | null
          last_event_id: string | null
          model_id: string | null
          output_cost_micros: number | null
          output_tokens: number | null
          pricing_version: string | null
          provider_cost: Json | null
          provider_usage: Json | null
          source: string
          started_at: string
          status: string
          thread_id: string
          total_cost_micros: number | null
          total_tokens: number | null
          updated_at: string
          user_id: string
          user_message_id: string
        }
        Insert: {
          agent_name: string
          assistant_message_id: string
          cache_read_cost_micros?: number | null
          cache_read_tokens?: number | null
          cache_write_cost_micros?: number | null
          cache_write_tokens?: number | null
          cost_currency?: string
          cost_source?: string
          created_at?: string
          cursor_agent_id: string
          cursor_run_id: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_cost_micros?: number | null
          input_tokens?: number | null
          last_event_id?: string | null
          model_id?: string | null
          output_cost_micros?: number | null
          output_tokens?: number | null
          pricing_version?: string | null
          provider_cost?: Json | null
          provider_usage?: Json | null
          source: string
          started_at?: string
          status: string
          thread_id: string
          total_cost_micros?: number | null
          total_tokens?: number | null
          updated_at?: string
          user_id: string
          user_message_id: string
        }
        Update: {
          agent_name?: string
          assistant_message_id?: string
          cache_read_cost_micros?: number | null
          cache_read_tokens?: number | null
          cache_write_cost_micros?: number | null
          cache_write_tokens?: number | null
          cost_currency?: string
          cost_source?: string
          created_at?: string
          cursor_agent_id?: string
          cursor_run_id?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          input_cost_micros?: number | null
          input_tokens?: number | null
          last_event_id?: string | null
          model_id?: string | null
          output_cost_micros?: number | null
          output_tokens?: number | null
          pricing_version?: string | null
          provider_cost?: Json | null
          provider_usage?: Json | null
          source?: string
          started_at?: string
          status?: string
          thread_id?: string
          total_cost_micros?: number | null
          total_tokens?: number | null
          updated_at?: string
          user_id?: string
          user_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cursor_runs_assistant_message_id_fkey"
            columns: ["assistant_message_id"]
            isOneToOne: false
            referencedRelation: "cursor_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cursor_runs_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "cursor_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cursor_runs_user_message_id_fkey"
            columns: ["user_message_id"]
            isOneToOne: false
            referencedRelation: "cursor_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      cursor_threads: {
        Row: {
          agent_name: string
          created_at: string
          cursor_agent_id: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_name: string
          created_at?: string
          cursor_agent_id?: string | null
          id?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_name?: string
          created_at?: string
          cursor_agent_id?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const

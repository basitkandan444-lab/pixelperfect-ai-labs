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
      events: {
        Row: {
          browser: string | null
          bytes: number | null
          campaign: string | null
          city: string | null
          country: string | null
          device_type: string | null
          duration_ms: number | null
          error_code: string | null
          id: number
          language: string | null
          medium: string | null
          metrics: Json | null
          name: string
          ok: boolean | null
          os: string | null
          path: string | null
          referrer_host: string | null
          region: string | null
          screen_h: number | null
          screen_w: number | null
          session_id: string
          source: string | null
          timezone: string | null
          ts: string
          ua_kind: string | null
        }
        Insert: {
          browser?: string | null
          bytes?: number | null
          campaign?: string | null
          city?: string | null
          country?: string | null
          device_type?: string | null
          duration_ms?: number | null
          error_code?: string | null
          id?: number
          language?: string | null
          medium?: string | null
          metrics?: Json | null
          name: string
          ok?: boolean | null
          os?: string | null
          path?: string | null
          referrer_host?: string | null
          region?: string | null
          screen_h?: number | null
          screen_w?: number | null
          session_id: string
          source?: string | null
          timezone?: string | null
          ts?: string
          ua_kind?: string | null
        }
        Update: {
          browser?: string | null
          bytes?: number | null
          campaign?: string | null
          city?: string | null
          country?: string | null
          device_type?: string | null
          duration_ms?: number | null
          error_code?: string | null
          id?: number
          language?: string | null
          medium?: string | null
          metrics?: Json | null
          name?: string
          ok?: boolean | null
          os?: string | null
          path?: string | null
          referrer_host?: string | null
          region?: string | null
          screen_h?: number | null
          screen_w?: number | null
          session_id?: string
          source?: string | null
          timezone?: string | null
          ts?: string
          ua_kind?: string | null
        }
        Relationships: []
      }
      investigation_bookmarks: {
        Row: {
          archived_at: string | null
          category: string | null
          created_at: string
          description: string | null
          favorite: boolean
          folder: string | null
          id: string
          linked_alerts: string[]
          linked_incidents: string[]
          notes: string | null
          pinned: boolean
          priority: string
          reason: string | null
          risk: string | null
          session_id: string
          status: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          favorite?: boolean
          folder?: string | null
          id?: string
          linked_alerts?: string[]
          linked_incidents?: string[]
          notes?: string | null
          pinned?: boolean
          priority?: string
          reason?: string | null
          risk?: string | null
          session_id: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          favorite?: boolean
          folder?: string | null
          id?: string
          linked_alerts?: string[]
          linked_incidents?: string[]
          notes?: string | null
          pinned?: boolean
          priority?: string
          reason?: string | null
          risk?: string | null
          session_id?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investigation_workspaces: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          name: string
          shared: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          shared?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          shared?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      telemetry_snapshots: {
        Row: {
          avg_ms: number
          cls_p75: number
          deployment: string
          errors: Json
          failure: number
          fcp_p75: number
          id: string
          inp_p75: number
          lcp_p75: number
          p95_ms: number
          requests: number
          samples: number
          success: number
          success_rate: number
          ts: string
          ttfb_p75: number
        }
        Insert: {
          avg_ms?: number
          cls_p75?: number
          deployment?: string
          errors?: Json
          failure?: number
          fcp_p75?: number
          id?: string
          inp_p75?: number
          lcp_p75?: number
          p95_ms?: number
          requests?: number
          samples?: number
          success?: number
          success_rate?: number
          ts?: string
          ttfb_p75?: number
        }
        Update: {
          avg_ms?: number
          cls_p75?: number
          deployment?: string
          errors?: Json
          failure?: number
          fcp_p75?: number
          id?: string
          inp_p75?: number
          lcp_p75?: number
          p95_ms?: number
          requests?: number
          samples?: number
          success?: number
          success_rate?: number
          ts?: string
          ttfb_p75?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      events_hourly: {
        Row: {
          country: string | null
          device_type: string | null
          hour: string | null
          n: number | null
          name: string | null
          source: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const

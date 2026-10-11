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
      alerts: {
        Row: {
          active: boolean
          created_at: string
          data: Json
          id: string
          key: string
          message: string
          resolved_at: string | null
          restaurant_id: string
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
          type: Database["public"]["Enums"]["alert_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          data?: Json
          id?: string
          key: string
          message: string
          resolved_at?: string | null
          restaurant_id: string
          severity: Database["public"]["Enums"]["alert_severity"]
          title: string
          type: Database["public"]["Enums"]["alert_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          data?: Json
          id?: string
          key?: string
          message?: string
          resolved_at?: string | null
          restaurant_id?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
          title?: string
          type?: Database["public"]["Enums"]["alert_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          last4: string
          name: string
          restaurant_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          last4: string
          name?: string
          restaurant_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          last4?: string
          name?: string
          restaurant_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount: number
          created_at: string
          data: Json
          description: string
          id: string
          order_id: string | null
          period_end: string | null
          period_start: string | null
          restaurant_id: string
          subscription_id: string | null
          type: Database["public"]["Enums"]["billing_event_type"]
        }
        Insert: {
          amount?: number
          created_at?: string
          data?: Json
          description: string
          id?: string
          order_id?: string | null
          period_end?: string | null
          period_start?: string | null
          restaurant_id: string
          subscription_id?: string | null
          type: Database["public"]["Enums"]["billing_event_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          data?: Json
          description?: string
          id?: string
          order_id?: string | null
          period_end?: string | null
          period_start?: string | null
          restaurant_id?: string
          subscription_id?: string | null
          type?: Database["public"]["Enums"]["billing_event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          description: string
          external_ref: string | null
          id: string
          kind: Database["public"]["Enums"]["credit_movement"]
          order_id: string | null
          restaurant_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          description: string
          external_ref?: string | null
          id?: string
          kind: Database["public"]["Enums"]["credit_movement"]
          order_id?: string | null
          restaurant_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          description?: string
          external_ref?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["credit_movement"]
          order_id?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_purchases: {
        Row: {
          amount: number
          bonus: number
          created_at: string
          created_by: string | null
          external_id: string | null
          gross: number
          id: string
          invoice_url: string | null
          package_id: string | null
          paid_at: string | null
          pix_copy_paste: string | null
          provider: string
          restaurant_id: string
          simulated: boolean
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          bonus?: number
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          gross: number
          id?: string
          invoice_url?: string | null
          package_id?: string | null
          paid_at?: string | null
          pix_copy_paste?: string | null
          provider?: string
          restaurant_id: string
          simulated?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bonus?: number
          created_at?: string
          created_by?: string | null
          external_id?: string | null
          gross?: number
          id?: string
          invoice_url?: string | null
          package_id?: string | null
          paid_at?: string | null
          pix_copy_paste?: string | null
          provider?: string
          restaurant_id?: string
          simulated?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_packages: {
        Row: {
          active: boolean
          amount: number
          bonus: number
          id: string
          label: string | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          amount: number
          bonus?: number
          id?: string
          label?: string | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          amount?: number
          bonus?: number
          id?: string
          label?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          orders_count: number
          phone: string | null
          region: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          orders_count?: number
          phone?: string | null
          region?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          orders_count?: number
          phone?: string | null
          region?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_attempts: {
        Row: {
          attempt_number: number
          counts_for_acceptance: boolean
          created_at: string
          distance_pickup_km: number | null
          distance_total_km: number | null
          eta_dropoff_min: number | null
          eta_pickup_min: number | null
          expires_at: string
          group_order_ids: string[] | null
          group_plan: Json | null
          id: string
          motoboy_id: string
          offered_at: string
          order_id: string
          outcome: Database["public"]["Enums"]["dispatch_outcome"] | null
          payout_estimate: number | null
          quality: Database["public"]["Enums"]["offer_quality"] | null
          quality_factors: Json
          quality_score: number | null
          reason: string | null
          responded_at: string | null
          restaurant_id: string
          score: number | null
          score_breakdown: Json
        }
        Insert: {
          attempt_number?: number
          counts_for_acceptance?: boolean
          created_at?: string
          distance_pickup_km?: number | null
          distance_total_km?: number | null
          eta_dropoff_min?: number | null
          eta_pickup_min?: number | null
          expires_at?: string
          group_order_ids?: string[] | null
          group_plan?: Json | null
          id?: string
          motoboy_id: string
          offered_at?: string
          order_id: string
          outcome?: Database["public"]["Enums"]["dispatch_outcome"] | null
          payout_estimate?: number | null
          quality?: Database["public"]["Enums"]["offer_quality"] | null
          quality_factors?: Json
          quality_score?: number | null
          reason?: string | null
          responded_at?: string | null
          restaurant_id: string
          score?: number | null
          score_breakdown?: Json
        }
        Update: {
          attempt_number?: number
          counts_for_acceptance?: boolean
          created_at?: string
          distance_pickup_km?: number | null
          distance_total_km?: number | null
          eta_dropoff_min?: number | null
          eta_pickup_min?: number | null
          expires_at?: string
          group_order_ids?: string[] | null
          group_plan?: Json | null
          id?: string
          motoboy_id?: string
          offered_at?: string
          order_id?: string
          outcome?: Database["public"]["Enums"]["dispatch_outcome"] | null
          payout_estimate?: number | null
          quality?: Database["public"]["Enums"]["offer_quality"] | null
          quality_factors?: Json
          quality_score?: number | null
          reason?: string | null
          responded_at?: string | null
          restaurant_id?: string
          score?: number | null
          score_breakdown?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_attempts_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_attempts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_lock: {
        Row: {
          id: number
          leased_at: string
        }
        Insert: {
          id?: number
          leased_at?: string
        }
        Update: {
          id?: number
          leased_at?: string
        }
        Relationships: []
      }
      platform_alert_state: {
        Row: {
          key: string
          last_sent_at: string | null
          last_status: string | null
          updated_at: string
        }
        Insert: {
          key: string
          last_sent_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          last_sent_at?: string | null
          last_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dispatch_runs: {
        Row: {
          duration_ms: number | null
          error: string | null
          expired: number
          failed: number
          finished_at: string | null
          id: string
          offered: number
          restaurant_id: string | null
          skipped: boolean
          source: string
          started_at: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          expired?: number
          failed?: number
          finished_at?: string | null
          id?: string
          offered?: number
          restaurant_id?: string | null
          skipped?: boolean
          source?: string
          started_at?: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          expired?: number
          failed?: number
          finished_at?: string | null
          id?: string
          offered?: number
          restaurant_id?: string | null
          skipped?: boolean
          source?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_earnings: {
        Row: {
          amount: number
          batch_id: string | null
          earned_at: string
          id: string
          motoboy_id: string
          order_id: string
        }
        Insert: {
          amount: number
          batch_id?: string | null
          earned_at?: string
          id?: string
          motoboy_id: string
          order_id: string
        }
        Update: {
          amount?: number
          batch_id?: string | null
          earned_at?: string
          id?: string
          motoboy_id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_earnings_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_earnings_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_incidents: {
        Row: {
          created_at: string
          id: string
          motoboy_id: string
          note: string | null
          order_id: string | null
          origin: Database["public"]["Enums"]["incident_origin"]
          restaurant_id: string | null
          severity: number
          type: Database["public"]["Enums"]["incident_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          motoboy_id: string
          note?: string | null
          order_id?: string | null
          origin?: Database["public"]["Enums"]["incident_origin"]
          restaurant_id?: string | null
          severity?: number
          type: Database["public"]["Enums"]["incident_type"]
        }
        Update: {
          created_at?: string
          id?: string
          motoboy_id?: string
          note?: string | null
          order_id?: string | null
          origin?: Database["public"]["Enums"]["incident_origin"]
          restaurant_id?: string | null
          severity?: number
          type?: Database["public"]["Enums"]["incident_type"]
        }
        Relationships: [
          {
            foreignKeyName: "driver_incidents_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_incidents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_incidents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          id: number
          latitude: number
          longitude: number
          motoboy_id: string
          order_id: string | null
          recorded_at: string
          restaurant_id: string
          speed: number | null
        }
        Insert: {
          accuracy?: number | null
          id?: never
          latitude: number
          longitude: number
          motoboy_id: string
          order_id?: string | null
          recorded_at?: string
          restaurant_id: string
          speed?: number | null
        }
        Update: {
          accuracy?: number | null
          id?: never
          latitude?: number
          longitude?: number
          motoboy_id?: string
          order_id?: string | null
          recorded_at?: string
          restaurant_id?: string
          speed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_terms_acceptance: {
        Row: {
          accepted_at: string
          id: string
          ip: string | null
          motoboy_id: string
          terms_version: number
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip?: string | null
          motoboy_id: string
          terms_version: number
        }
        Update: {
          accepted_at?: string
          id?: string
          ip?: string | null
          motoboy_id?: string
          terms_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_terms_acceptance_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_terms_acceptance_terms_version_fkey"
            columns: ["terms_version"]
            isOneToOne: false
            referencedRelation: "terms_versions"
            referencedColumns: ["version"]
          },
        ]
      }
      platform_withdrawals: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      error_events: {
        Row: {
          created_at: string
          detail: Json
          id: string
          message: string
          restaurant_id: string | null
          scope: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          message: string
          restaurant_id?: string | null
          scope: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          message?: string
          restaurant_id?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          attempts: number
          created_at: string
          direction: string
          error: string | null
          event_id: string | null
          external_order_id: string | null
          id: string
          order_id: string | null
          payload: Json
          processed_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          restaurant_id: string | null
          signature_valid: boolean | null
          status: Database["public"]["Enums"]["integration_event_status"]
        }
        Insert: {
          attempts?: number
          created_at?: string
          direction?: string
          error?: string | null
          event_id?: string | null
          external_order_id?: string | null
          id?: string
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          restaurant_id?: string | null
          signature_valid?: boolean | null
          status?: Database["public"]["Enums"]["integration_event_status"]
        }
        Update: {
          attempts?: number
          created_at?: string
          direction?: string
          error?: string | null
          event_id?: string | null
          external_order_id?: string | null
          id?: string
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          restaurant_id?: string | null
          signature_valid?: boolean | null
          status?: Database["public"]["Enums"]["integration_event_status"]
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          credentials_set: boolean
          id: string
          last_event_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          restaurant_id: string
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
          webhook_secret_hint: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          credentials_set?: boolean
          id?: string
          last_event_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          restaurant_id: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          webhook_secret_hint?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          credentials_set?: boolean
          id?: string
          last_event_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          restaurant_id?: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
          webhook_secret_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      motoboys: {
        Row: {
          acceptance_rate: number
          active: boolean
          approval_reason: string | null
          approval_status: Database["public"]["Enums"]["driver_approval_status"]
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          avg_delay_min: number
          blocked: boolean
          blocked_reason: string | null
          city: string | null
          completion_rate_pct: number
          cpf: string | null
          created_at: string
          current_latitude: number | null
          current_longitude: number | null
          deliveries_completed: number
          deliveries_late: number
          deliveries_total: number
          fleet: Database["public"]["Enums"]["driver_fleet"]
          full_name: string
          id: string
          location_updated_at: string | null
          max_concurrent_deliveries: number
          offers_adequate: number
          offers_adequate_accepted: number
          personal_doc_back_path: string | null
          personal_doc_path: string | null
          phone: string
          pix_key: string | null
          pix_key_type: string | null
          punctuality_rate: number
          push_enabled: boolean
          rating: number
          reliability_index: number
          reputation_updated_at: string | null
          restaurant_id: string | null
          signup_source: string
          status: Database["public"]["Enums"]["motoboy_status"]
          terms_accepted_version: number | null
          updated_at: string
          user_id: string | null
          vehicle: string | null
          vehicle_doc_path: string | null
        }
        Insert: {
          acceptance_rate?: number
          active?: boolean
          approval_reason?: string | null
          approval_status?: Database["public"]["Enums"]["driver_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          avg_delay_min?: number
          blocked?: boolean
          blocked_reason?: string | null
          city?: string | null
          completion_rate_pct?: number
          cpf?: string | null
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          deliveries_completed?: number
          deliveries_late?: number
          deliveries_total?: number
          fleet?: Database["public"]["Enums"]["driver_fleet"]
          full_name: string
          id?: string
          location_updated_at?: string | null
          max_concurrent_deliveries?: number
          offers_adequate?: number
          offers_adequate_accepted?: number
          personal_doc_back_path?: string | null
          personal_doc_path?: string | null
          phone: string
          pix_key?: string | null
          pix_key_type?: string | null
          punctuality_rate?: number
          push_enabled?: boolean
          rating?: number
          reliability_index?: number
          reputation_updated_at?: string | null
          restaurant_id?: string | null
          signup_source?: string
          status?: Database["public"]["Enums"]["motoboy_status"]
          terms_accepted_version?: number | null
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
          vehicle_doc_path?: string | null
        }
        Update: {
          acceptance_rate?: number
          active?: boolean
          approval_reason?: string | null
          approval_status?: Database["public"]["Enums"]["driver_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          avg_delay_min?: number
          blocked?: boolean
          blocked_reason?: string | null
          city?: string | null
          completion_rate_pct?: number
          cpf?: string | null
          created_at?: string
          current_latitude?: number | null
          current_longitude?: number | null
          deliveries_completed?: number
          deliveries_late?: number
          deliveries_total?: number
          fleet?: Database["public"]["Enums"]["driver_fleet"]
          full_name?: string
          id?: string
          location_updated_at?: string | null
          max_concurrent_deliveries?: number
          offers_adequate?: number
          offers_adequate_accepted?: number
          personal_doc_back_path?: string | null
          personal_doc_path?: string | null
          phone?: string
          pix_key?: string | null
          pix_key_type?: string | null
          punctuality_rate?: number
          push_enabled?: boolean
          rating?: number
          reliability_index?: number
          reputation_updated_at?: string | null
          restaurant_id?: string | null
          signup_source?: string
          status?: Database["public"]["Enums"]["motoboy_status"]
          terms_accepted_version?: number | null
          updated_at?: string
          user_id?: string | null
          vehicle?: string | null
          vehicle_doc_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motoboys_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motoboys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          data: Json
          error: string | null
          id: string
          order_id: string | null
          recipient: string | null
          recipient_type: Database["public"]["Enums"]["notification_recipient"]
          restaurant_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          template: string
          title: string | null
        }
        Insert: {
          attempts?: number
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          data?: Json
          error?: string | null
          id?: string
          order_id?: string | null
          recipient?: string | null
          recipient_type: Database["public"]["Enums"]["notification_recipient"]
          restaurant_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template: string
          title?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          data?: Json
          error?: string | null
          id?: string
          order_id?: string | null
          recipient?: string | null
          recipient_type?: Database["public"]["Enums"]["notification_recipient"]
          restaurant_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          template?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          created_at: string
          data: Json
          id: number
          order_id: string
          restaurant_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          data?: Json
          id?: never
          order_id: string
          restaurant_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          data?: Json
          id?: never
          order_id?: string
          restaurant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          order_id: string
          quantity: number
          restaurant_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          order_id: string
          quantity?: number
          restaurant_id: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          restaurant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          id: string
          order_id: string
          restaurant_id: string
          sender_type: string
          sender_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          restaurant_id: string
          sender_type: string
          sender_id: string
          body: string
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          restaurant_id?: string
          sender_type?: string
          sender_id?: string
          body?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_messages_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          order_id: string
          restaurant_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id: string
          restaurant_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id?: string
          restaurant_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          assigned_at: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          customer_address: string
          customer_fee: number | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          delivered_at: string | null
          delivered_lat: number | null
          delivered_lng: number | null
          delivery_confirmation_code: string | null
          ifood_locator: string | null
          ifood_confirmed_at: string | null
          delivery_distance_m: number | null
          delivery_fee: number
          delivery_gps_status: string | null
          delivery_photo_path: string | null
          dispatch_attempts: number
          dispatch_hold: boolean
          dispatch_state: Database["public"]["Enums"]["dispatch_state"]
          dispatched_at: string | null
          driver_payout: number | null
          eta_computed_at: string | null
          eta_max: number | null
          eta_min: number | null
          external_id: string | null
          group_id: string | null
          group_lead: boolean
          group_sequence: number | null
          id: string
          in_route_at: string | null
          latitude: number | null
          leeva_fee: number | null
          logistics_margin: number | null
          longitude: number | null
          motoboy_id: string | null
          notes: string | null
          order_amount: number
          order_number: number | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          payout_boost: number | null
          picked_up_at: string | null
          preparing_at: string | null
          prep_estimate_minutes: number | null
          ready_at: string | null
          region: string | null
          restaurant_id: string
          route_distance_km: number | null
          route_duration_min: number | null
          route_position: number | null
          source: Database["public"]["Enums"]["order_source"]
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_address: string
          customer_fee?: number | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          delivered_at?: string | null
          delivered_lat?: number | null
          delivered_lng?: number | null
          delivery_confirmation_code?: string | null
          ifood_locator?: string | null
          ifood_confirmed_at?: string | null
          delivery_distance_m?: number | null
          delivery_fee?: number
          delivery_gps_status?: string | null
          delivery_photo_path?: string | null
          dispatch_attempts?: number
          dispatch_hold?: boolean
          dispatch_state?: Database["public"]["Enums"]["dispatch_state"]
          dispatched_at?: string | null
          driver_payout?: number | null
          eta_computed_at?: string | null
          eta_max?: number | null
          eta_min?: number | null
          external_id?: string | null
          group_id?: string | null
          group_lead?: boolean
          group_sequence?: number | null
          id?: string
          in_route_at?: string | null
          latitude?: number | null
          leeva_fee?: number | null
          logistics_margin?: number | null
          longitude?: number | null
          motoboy_id?: string | null
          notes?: string | null
          order_amount?: number
          order_number?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payout_boost?: number | null
          picked_up_at?: string | null
          preparing_at?: string | null
          prep_estimate_minutes?: number | null
          ready_at?: string | null
          region?: string | null
          restaurant_id: string
          route_distance_km?: number | null
          route_duration_min?: number | null
          route_position?: number | null
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_address?: string
          customer_fee?: number | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivered_at?: string | null
          delivered_lat?: number | null
          delivered_lng?: number | null
          delivery_confirmation_code?: string | null
          ifood_locator?: string | null
          ifood_confirmed_at?: string | null
          delivery_distance_m?: number | null
          delivery_fee?: number
          delivery_gps_status?: string | null
          delivery_photo_path?: string | null
          dispatch_attempts?: number
          dispatch_hold?: boolean
          dispatch_state?: Database["public"]["Enums"]["dispatch_state"]
          dispatched_at?: string | null
          driver_payout?: number | null
          eta_computed_at?: string | null
          eta_max?: number | null
          eta_min?: number | null
          external_id?: string | null
          group_id?: string | null
          group_lead?: boolean
          group_sequence?: number | null
          id?: string
          in_route_at?: string | null
          latitude?: number | null
          leeva_fee?: number | null
          logistics_margin?: number | null
          longitude?: number | null
          motoboy_id?: string | null
          notes?: string | null
          order_amount?: number
          order_number?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payout_boost?: number | null
          picked_up_at?: string | null
          preparing_at?: string | null
          prep_estimate_minutes?: number | null
          ready_at?: string | null
          region?: string | null
          restaurant_id?: string
          route_distance_km?: number | null
          route_duration_min?: number | null
          route_position?: number | null
          source?: Database["public"]["Enums"]["order_source"]
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_batches: {
        Row: {
          amount: number
          created_at: string
          earnings_count: number
          error: string | null
          external_ref: string | null
          id: string
          motoboy_id: string
          paid_at: string | null
          period_date: string
          pix_key: string | null
          pix_key_type: string | null
          simulated: boolean
          status: Database["public"]["Enums"]["payout_batch_status"]
          transfer_fee: number
        }
        Insert: {
          amount: number
          created_at?: string
          earnings_count?: number
          error?: string | null
          external_ref?: string | null
          id?: string
          motoboy_id: string
          paid_at?: string | null
          period_date: string
          pix_key?: string | null
          pix_key_type?: string | null
          simulated?: boolean
          status?: Database["public"]["Enums"]["payout_batch_status"]
          transfer_fee?: number
        }
        Update: {
          amount?: number
          created_at?: string
          earnings_count?: number
          error?: string | null
          external_ref?: string | null
          id?: string
          motoboy_id?: string
          paid_at?: string | null
          period_date?: string
          pix_key?: string | null
          pix_key_type?: string | null
          simulated?: boolean
          status?: Database["public"]["Enums"]["payout_batch_status"]
          transfer_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "payout_batches_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_policies: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          id: string
          name: string
          restaurant_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_policies_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          code: string
          created_at: string
          features: Json
          id: string
          monthly_price: number
          name: string
          per_delivery_margin: number
          per_delivery_price: number
          sort_order: number
          trial_days: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          features?: Json
          id?: string
          monthly_price?: number
          name: string
          per_delivery_margin?: number
          per_delivery_price?: number
          sort_order?: number
          trial_days?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          features?: Json
          id?: string
          monthly_price?: number
          name?: string
          per_delivery_margin?: number
          per_delivery_price?: number
          sort_order?: number
          trial_days?: number
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          name: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          name?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          kind: string
          last_seen_at: string
          motoboy_id: string
          p256dh: string | null
          user_agent: string | null
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          kind?: string
          last_seen_at?: string
          motoboy_id: string
          p256dh?: string | null
          user_agent?: string | null
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          kind?: string
          last_seen_at?: string
          motoboy_id?: string
          p256dh?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      reputation_config: {
        Row: {
          config: Json
          id: number
          updated_at: string
        }
        Insert: {
          config?: Json
          id?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_credits: {
        Row: {
          balance: number
          low_balance_threshold: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          low_balance_threshold?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          low_balance_threshold?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_credits_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_shifts: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          motoboy_id: string
          note: string | null
          restaurant_id: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          motoboy_id: string
          note?: string | null
          restaurant_id: string
          starts_at: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          motoboy_id?: string
          note?: string | null
          restaurant_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_shifts_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_driver_prefs: {
        Row: {
          created_at: string
          id: string
          kind: string
          motoboy_id: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          motoboy_id: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          motoboy_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_driver_prefs_motoboy_id_fkey"
            columns: ["motoboy_id"]
            isOneToOne: false
            referencedRelation: "motoboys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_driver_prefs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          business_hours: Json | null
          created_at: string
          expected_daily_orders: number | null
          fleet_mode: Database["public"]["Enums"]["fleet_mode"]
          id: string
          latitude: number | null
          logistics_config: Json
          longitude: number | null
          name: string
          onboarding_completed: boolean
          phone: string | null
          settings: Json
          terms_accepted_version: number | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_hours?: Json | null
          created_at?: string
          expected_daily_orders?: number | null
          fleet_mode?: Database["public"]["Enums"]["fleet_mode"]
          id?: string
          latitude?: number | null
          logistics_config?: Json
          longitude?: number | null
          name: string
          onboarding_completed?: boolean
          phone?: string | null
          settings?: Json
          terms_accepted_version?: number | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_hours?: Json | null
          created_at?: string
          expected_daily_orders?: number | null
          fleet_mode?: Database["public"]["Enums"]["fleet_mode"]
          id?: string
          latitude?: number | null
          logistics_config?: Json
          longitude?: number | null
          name?: string
          onboarding_completed?: boolean
          phone?: string | null
          settings?: Json
          terms_accepted_version?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_id: string
          restaurant_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id: string
          restaurant_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_id?: string
          restaurant_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_versions: {
        Row: {
          active: boolean
          audience: string
          content: string
          id: string
          published_at: string
          version: number
        }
        Insert: {
          active?: boolean
          audience?: string
          content: string
          id?: string
          published_at?: string
          version: number
        }
        Update: {
          active?: boolean
          audience?: string
          content?: string
          id?: string
          published_at?: string
          version?: number
        }
        Relationships: []
      }
      restaurant_terms_acceptance: {
        Row: {
          accepted_at: string
          id: string
          ip: string | null
          restaurant_id: string
          terms_version: number
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip?: string | null
          restaurant_id: string
          terms_version: number
        }
        Update: {
          accepted_at?: string
          id?: string
          ip?: string | null
          restaurant_id?: string
          terms_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_terms_acceptance_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          order_id: string
          restaurant_id: string
          revoked: boolean
          token: string
          views: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          order_id: string
          restaurant_id: string
          revoked?: boolean
          token: string
          views?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          order_id?: string
          restaurant_id?: string
          revoked?: boolean
          token?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "tracking_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_tokens_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          restaurant_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          restaurant_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_dispatch_lease: {
        Args: { ttl_seconds?: number }
        Returns: boolean
      }
      cleanup_driver_locations: {
        Args: { retention?: string }
        Returns: number
      }
      record_my_location: {
        Args: {
          p_latitude: number
          p_longitude: number
          p_accuracy?: number
          p_speed?: number
        }
        Returns: Json
      }
      configure_dispatch_cron: {
        Args: { p_schedule?: string; p_secret: string; p_target_url: string }
        Returns: string
      }
      configure_payout_cron: {
        Args: { p_schedule?: string; p_target_url: string }
        Returns: string
      }
      credit_add: {
        Args: {
          p_amount: number
          p_created_by?: string
          p_description: string
          p_external_ref?: string
          p_kind: Database["public"]["Enums"]["credit_movement"]
          p_restaurant_id: string
        }
        Returns: number
      }
      credit_adjust: {
        Args: {
          p_amount: number
          p_description: string
          p_restaurant_id: string
        }
        Returns: number
      }
      credit_consume: {
        Args: {
          p_amount: number
          p_description: string
          p_order_id: string
          p_restaurant_id: string
        }
        Returns: {
          allowed: boolean
          new_balance: number
        }[]
      }
      credit_refund: {
        Args: { p_description?: string; p_order_id: string }
        Returns: number
      }
      current_motoboy_id: { Args: never; Returns: string }
      current_restaurant_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      haversine_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      is_platform_admin: { Args: never; Returns: boolean }
      motoboy_completion_rate: {
        Args: { m: Database["public"]["Tables"]["motoboys"]["Row"] }
        Returns: number
      }
      rate_limit_check: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          current_count: number
          retry_after: number
        }[]
      }
      release_dispatch_lease: { Args: never; Returns: undefined }
      release_lock: { Args: { key: string }; Returns: boolean }
      trigger_dispatch_tick: { Args: never; Returns: undefined }
      trigger_payout_closing: { Args: never; Returns: undefined }
      try_lock: { Args: { key: string }; Returns: boolean }
    }
    Enums: {
      alert_severity: "info" | "warning" | "critical" | "ok"
      alert_type:
        | "delay"
        | "no_driver"
        | "demand_spike"
        | "normal"
        | "long_prep"
      billing_event_type:
        | "subscription_fee"
        | "delivery_fee"
        | "adjustment"
        | "credit"
      credit_movement:
        | "purchase"
        | "consumption"
        | "refund"
        | "adjustment"
        | "bonus"
      dispatch_outcome:
        | "accepted"
        | "declined"
        | "timeout"
        | "cancelled"
        | "expired"
      dispatch_state: "none" | "searching" | "offered" | "assigned" | "failed"
      driver_approval_status: "pending_approval" | "approved" | "rejected"
      driver_fleet: "own" | "leeva"
      fleet_mode: "own" | "leeva" | "hybrid"
      incident_origin:
        | "driver"
        | "restaurant"
        | "customer"
        | "system"
        | "unknown"
      incident_type:
        | "decline_adequate_offer"
        | "cancel_after_accept"
        | "abandon"
        | "no_show"
        | "late_delivery"
        | "complaint"
      integration_event_status:
        | "received"
        | "processed"
        | "failed"
        | "duplicate"
        | "ignored"
      integration_provider: "ifood" | "whatsapp" | "sms" | "push" | "maps"
      integration_status: "implemented" | "prepared" | "mock" | "disabled"
      motoboy_status: "offline" | "available" | "on_delivery"
      notification_channel: "in_app" | "whatsapp" | "sms" | "push"
      notification_recipient: "customer" | "restaurant" | "motoboy"
      notification_status: "pending" | "sent" | "failed" | "skipped"
      offer_quality: "excellent" | "good" | "acceptable" | "poor"
      order_source: "manual" | "ifood" | "whatsapp" | "menu" | "api"
      order_status:
        | "waiting_dispatch"
        | "preparing"
        | "ready"
        | "assigned"
        | "picked_up"
        | "in_route"
        | "delivered"
        | "cancelled"
      payment_method:
        | "cash"
        | "card_on_delivery"
        | "online"
        | "pix"
        | "other"
        | "unknown"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      payout_batch_status:
        | "pending"
        | "processing"
        | "paid"
        | "failed"
        | "awaiting_pix"
      subscription_status: "trialing" | "active" | "past_due" | "canceled"
      user_role: "restaurant_owner" | "restaurant_staff" | "motoboy"
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
      alert_severity: ["info", "warning", "critical", "ok"],
      alert_type: ["delay", "no_driver", "demand_spike", "normal", "long_prep"],
      billing_event_type: [
        "subscription_fee",
        "delivery_fee",
        "adjustment",
        "credit",
      ],
      credit_movement: [
        "purchase",
        "consumption",
        "refund",
        "adjustment",
        "bonus",
      ],
      dispatch_outcome: [
        "accepted",
        "declined",
        "timeout",
        "cancelled",
        "expired",
      ],
      dispatch_state: ["none", "searching", "offered", "assigned", "failed"],
      driver_approval_status: ["pending_approval", "approved", "rejected"],
      driver_fleet: ["own", "leeva"],
      fleet_mode: ["own", "leeva", "hybrid"],
      incident_origin: [
        "driver",
        "restaurant",
        "customer",
        "system",
        "unknown",
      ],
      incident_type: [
        "decline_adequate_offer",
        "cancel_after_accept",
        "abandon",
        "no_show",
        "late_delivery",
        "complaint",
      ],
      integration_event_status: [
        "received",
        "processed",
        "failed",
        "duplicate",
        "ignored",
      ],
      integration_provider: ["ifood", "whatsapp", "sms", "push", "maps"],
      integration_status: ["implemented", "prepared", "mock", "disabled"],
      motoboy_status: ["offline", "available", "on_delivery"],
      notification_channel: ["in_app", "whatsapp", "sms", "push"],
      notification_recipient: ["customer", "restaurant", "motoboy"],
      notification_status: ["pending", "sent", "failed", "skipped"],
      offer_quality: ["excellent", "good", "acceptable", "poor"],
      order_source: ["manual", "ifood", "whatsapp", "menu", "api"],
      order_status: [
        "waiting_dispatch",
        "preparing",
        "ready",
        "assigned",
        "picked_up",
        "in_route",
        "delivered",
        "cancelled",
      ],
      payment_method: [
        "cash",
        "card_on_delivery",
        "online",
        "pix",
        "other",
        "unknown",
      ],
      payment_status: ["pending", "paid", "failed", "refunded"],
      payout_batch_status: [
        "pending",
        "processing",
        "paid",
        "failed",
        "awaiting_pix",
      ],
      subscription_status: ["trialing", "active", "past_due", "canceled"],
      user_role: ["restaurant_owner", "restaurant_staff", "motoboy"],
    },
  },
} as const

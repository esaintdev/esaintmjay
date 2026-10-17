/**
 * lib/database.types.ts
 * ---------------------------------------------------------
 * Types for the Supabase schema in scripts/migrate.sql, in the shape
 * `supabase gen types typescript` produces. Keep the two in sync: when a
 * column changes in migrate.sql, change it here too.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      settings: {
        Row: { id: number; data: Json };
        Insert: { id: number; data?: Json };
        Update: { id?: number; data?: Json };
        Relationships: [];
      };
      admin: {
        Row: { id: number; email: string; password: string };
        Insert: { id: number; email: string; password: string };
        Update: { id?: number; email?: string; password?: string };
        Relationships: [];
      };
      sessions: {
        Row: { token: string; expires: number };
        Insert: { token: string; expires: number };
        Update: { token?: string; expires?: number };
        Relationships: [];
      };
      limits: {
        Row: { key: string; count: number; reset: number };
        Insert: { key: string; count?: number; reset: number };
        Update: { key?: string; count?: number; reset?: number };
        Relationships: [];
      };
      groups: {
        Row: {
          id: string;
          slug: string;
          name: string;
          category: string;
          description: string;
          year: string;
          role: string;
          published: boolean;
          featured: boolean;
          sort_order: number;
          cover_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          category?: string;
          description?: string;
          year?: string;
          role?: string;
          published?: boolean;
          featured?: boolean;
          sort_order?: number;
          cover_id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["groups"]["Insert"]>;
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          group_id: string | null;
          entry_id: string | null;
          kind: string;
          filename: string;
          mime: string;
          bytes: number;
          title: string;
          alt: string;
          caption: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          group_id?: string | null;
          entry_id?: string | null;
          kind: string;
          filename: string;
          mime: string;
          bytes: number;
          title?: string;
          alt?: string;
          caption?: string;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["assets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "assets_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assets_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "entries";
            referencedColumns: ["id"];
          },
        ];
      };
      entries: {
        Row: {
          id: string;
          kind: string;
          title: string;
          subtitle: string;
          body: string;
          extra: string;
          published: boolean;
          sort_order: number;
          created_at: string;
          slug: string;
          cover_id: string;
          seo_title: string;
          seo_description: string;
          content: Json | null;
          published_at: string | null;
          calmify_key: string;
        };
        Insert: {
          id?: string;
          kind: string;
          title: string;
          subtitle?: string;
          body?: string;
          extra?: string;
          published?: boolean;
          sort_order?: number;
          created_at?: string;
          slug?: string;
          cover_id?: string;
          seo_title?: string;
          seo_description?: string;
          content?: Json | null;
          published_at?: string | null;
          calmify_key?: string;
        };
        Update: Partial<Database["public"]["Tables"]["entries"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          name: string;
          email: string;
          subject: string;
          message: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          subject: string;
          message: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      rate_limit_increment: {
        Args: { p_key: string; p_period: number };
        Returns: number;
      };
      reorder_items: {
        Args: { p_table: string; p_ids: string[] };
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]["Row"];

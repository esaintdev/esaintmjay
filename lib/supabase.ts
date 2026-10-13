/**
 * lib/supabase.ts
 * ---------------------------------------------------------
 * Server-only Supabase client (service role: full DB + Storage access).
 * Cached on globalThis so it survives Next.js hot reloads.
 *
 * Storage bucket is PRIVATE — files are reached only through /media/[id],
 * which checks publication or admin sign-in. Never use getPublicUrl().
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

type Client = SupabaseClient<Database>;
const cache = globalThis as typeof globalThis & { __esaintSupabase?: Client };

/** Use ONLY on the server (API routes, server components, scripts). */
export function supabase(): Client {
  if (cache.__esaintSupabase) return cache.__esaintSupabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    throw new Error(
      "Supabase environment variables are not set. " +
        "Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "to your .env.local file (or your host's environment).",
    );
  cache.__esaintSupabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });
  return cache.__esaintSupabase;
}

/** The storage bucket name. */
export const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "portfolio-assets";

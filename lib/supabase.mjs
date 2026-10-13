/**
 * lib/supabase.mjs
 * ---------------------------------------------------------
 * Singleton Supabase clients.
 *
 *  - supabase()     → service-role client (server-only, full access)
 *  - supabaseAnon() → anon client (safe for public reads)
 *
 * Storage bucket is PRIVATE — every file is streamed through /media/[id],
 * which checks publication or admin sign-in. Never use getPublicUrl().
 *
 * Both clients are cached on globalThis so they survive Next.js hot-reloads.
 */
import { createClient } from "@supabase/supabase-js";

function ensureEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    throw new Error(
      "Supabase environment variables are not set. " +
        "Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, " +
        "and SUPABASE_SERVICE_ROLE_KEY to your .env.local file.",
    );
  }
  return { url, serviceKey, anonKey };
}

/**
 * Service-role client — full DB + Storage access.
 * Use ONLY on the server (API routes, server components, scripts).
 */
export function supabase() {
  if (globalThis.__esaintSupabaseService) return globalThis.__esaintSupabaseService;
  const { url, serviceKey } = ensureEnv();
  globalThis.__esaintSupabaseService = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return globalThis.__esaintSupabaseService;
}

/**
 * Anon client — safe for browser / public reads.
 * Row-Level Security (RLS) applies.
 */
export function supabaseAnon() {
  if (globalThis.__esaintSupabaseAnon) return globalThis.__esaintSupabaseAnon;
  const { url, anonKey } = ensureEnv();
  globalThis.__esaintSupabaseAnon = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return globalThis.__esaintSupabaseAnon;
}

/** The storage bucket name. */
export const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "portfolio-assets";

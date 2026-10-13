/**
 * lib/db.mjs
 * ---------------------------------------------------------
 * Data-access layer backed by Supabase (PostgreSQL + Storage).
 *
 * Drop-in replacement for the previous SQLite version.
 * All exported symbols keep the same names so API routes and
 * page components need minimal changes.
 *
 * Tables (created via the SQL migration in scripts/migrate.sql):
 *   settings, admin, sessions, limits,
 *   groups, assets, entries, messages
 *
 * Storage: Supabase Storage bucket (SUPABASE_STORAGE_BUCKET)
 */
import { supabase, BUCKET } from "./supabase.mjs";

// ─── re-export BUCKET so callers that used uploadDir can use this ─────────────
export { BUCKET as uploadDir };

// ─── defaults ────────────────────────────────────────────────────────────────
export const defaults = {
  name: "Esaint Mjay",
  role: "Graphic designer",
  heroTitle: "Good design.\nLasting impressions.",
  heroDescription:
    "I turn ideas into distinctive visual identities, thoughtful campaigns, and design that connects.",
  availability: "Open to creative collaborations",
  specialties: "Brand identity,Visual design,Art direction",
  aboutLabel: "The designer behind the work",
  aboutTitle: "A thoughtful eye.\nA bold point of view.",
  aboutIntro:
    "I'm Esaint Mjay, a graphic designer with a focus on clarity, character, and the details that make a brand feel like itself.",
  aboutBody:
    "From an initial idea to the final artwork, I bring a considered approach to every project. My work brings together purposeful thinking and expressive visuals.",
  location: "",
  experience: "",
  email: "",
  phone: "",
  workTitle: "Selected work",
  workDescription:
    "A closer look at the brands, teams, and projects I design for.",
  servicesTitle: "What I do",
  contactTitle: "Have something\nin mind?",
  contactDescription:
    "Tell me about your brand, your idea, or your next chapter. Let's make something worth seeing.",
  footerNote: "Made with intention.",
  accent: "#e64b2f",
  portraitId: "",
  cvId: "",
  socialLinks: [],
  seoTitle: "Esaint Mjay — Graphic Designer",
  seoDescription:
    "Graphic design, brand identity, and visual storytelling by Esaint Mjay.",
  showServices: true,
  showAwards: true,
  showExperience: true,
  showArticles: true,
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function check(error, context = "") {
  if (error) {
    console.error(`[db] ${context}`, error);
    throw new Error(error.message || "Database error");
  }
}

// ─── settings ─────────────────────────────────────────────────────────────────
export async function getSettings() {
  const { data, error } = await supabase()
    .from("settings")
    .select("data")
    .eq("id", 1)
    .maybeSingle();
  check(error, "getSettings");
  if (!data) {
    // seed defaults on first run
    await supabase()
      .from("settings")
      .insert({ id: 1, data: defaults });
    return { ...defaults };
  }
  return { ...defaults, ...(data.data || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const merged = { ...current, ...patch };
  const { error } = await supabase()
    .from("settings")
    .upsert({ id: 1, data: merged });
  check(error, "saveSettings");
  return merged;
}

// ─── groups ───────────────────────────────────────────────────────────────────
export async function groups(all = false) {
  let q = supabase()
    .from("groups")
    .select(
      `*, assets(count), first_asset:assets(id, sort_order)`,
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (!all) q = q.eq("published", true);

  const { data, error } = await q;
  check(error, "groups");

  return (data || []).map((g) => ({
    ...g,
    image_count: g.assets?.[0]?.count ?? 0,
    image_id:
      g.cover_id ||
      (g.first_asset?.length ? g.first_asset[0].id : ""),
    // clean up joined fields
    assets: undefined,
    first_asset: undefined,
  }));
}

// ─── assets ───────────────────────────────────────────────────────────────────
export async function assets(groupId) {
  const { data, error } = await supabase()
    .from("assets")
    .select("*")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  check(error, "assets");
  return data || [];
}

// ─── entries ──────────────────────────────────────────────────────────────────
export async function entries(kind, all = false) {
  let q = supabase()
    .from("entries")
    .select("*")
    .eq("kind", kind)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (!all) q = q.eq("published", true);

  const { data, error } = await q;
  check(error, "entries");
  return data || [];
}

// ─── generic find ─────────────────────────────────────────────────────────────
/**
 * Fetch a single row by id from any table.
 * Throws a 404-style error (compatible with HttpError) if not found.
 */
export async function findById(table, id) {
  const { data, error } = await supabase()
    .from(table)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check(error, `findById(${table})`);
  if (!data) {
    const err = new Error("This item no longer exists.");
    err.status = 404;
    throw err;
  }
  return data;
}

// ─── storage helpers ──────────────────────────────────────────────────────────
/**
 * Upload a file buffer to Supabase Storage.
 * Returns the storage path (used as `filename` in the assets table).
 */
export async function storageUpload(filename, buffer, mimeType) {
  const { error } = await supabase()
    .storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: mimeType,
      upsert: false,
    });
  if (error) {
    console.error("[storage] upload failed", error);
    throw new Error(error.message || "Upload failed");
  }
  return filename;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function storageDelete(filename) {
  if (!filename) return;
  const { error } = await supabase()
    .storage
    .from(BUCKET)
    .remove([filename]);
  if (error) console.error("[storage] delete failed", filename, error);
}



/**
 * Returns the raw Supabase client for callers that used db() directly.
 * Prefer the named helpers above; this exists for backward compatibility.
 */
export const db = supabase;

// ─── transaction shim ────────────────────────────────────────────────────────
/**
 * Runs an async function and propagates errors.
 * Supabase (Postgres) does not expose a JS-level transaction primitive
 * the same way SQLite did.  For true atomicity use a stored procedure
 * or the Supabase RPC approach.  For most operations here, sequential
 * await calls are sufficient.
 */
export async function transaction(fn) {
  return fn(supabase());
}

/**
 * lib/db.mjs
 * ---------------------------------------------------------
 * Data-access layer backed by Supabase (PostgreSQL + Storage).
 *
 * Tables (created via the SQL migration in scripts/migrate.sql):
 *   settings, admin, sessions, limits,
 *   groups, assets, entries, messages
 *
 * Storage: Supabase Storage bucket (SUPABASE_STORAGE_BUCKET)
 */
import { supabase, BUCKET } from "./supabase.mjs";

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
 * Create a one-time URL the admin's browser can PUT a file to directly,
 * so large uploads never pass through the app server (Vercel functions
 * accept at most ~4.5 MB per request).
 */
export async function storageUploadUrl(filename) {
  const { data, error } = await supabase()
    .storage
    .from(BUCKET)
    .createSignedUploadUrl(filename);
  if (error) {
    console.error("[storage] signed upload URL failed", error);
    throw new Error(error.message || "Upload failed");
  }
  return data.signedUrl;
}

/**
 * Short-lived download URL for a file in the private bucket.
 * `download` forces a download with that file name.
 */
export async function storageSignedUrl(filename, seconds, download) {
  const { data, error } = await supabase()
    .storage
    .from(BUCKET)
    .createSignedUrl(filename, seconds, download ? { download } : undefined);
  if (error || !data?.signedUrl) {
    console.error("[storage] signed URL failed", filename, error?.message);
    return null;
  }
  return data.signedUrl;
}

/**
 * Read an uploaded file's size and first bytes (for signature checks)
 * without downloading the whole file. Returns null if it doesn't exist.
 */
export async function storageInspect(filename, bytes = 64) {
  const url = await storageSignedUrl(filename, 60);
  if (!url) return null;
  const r = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!r.ok) return null;
  const total = r.headers.get("content-range")?.split("/")[1];
  const size = Number(total ?? r.headers.get("content-length"));
  // read only what we need, even if the server ignored the Range header
  const reader = r.body.getReader();
  const parts = [];
  let read = 0;
  while (read < bytes) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    read += value.length;
  }
  await reader.cancel().catch(() => {});
  return { size, head: Buffer.concat(parts).subarray(0, bytes) };
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

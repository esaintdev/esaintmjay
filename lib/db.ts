/**
 * lib/db.ts
 * ---------------------------------------------------------
 * Data-access layer backed by Supabase (PostgreSQL + Storage).
 *
 * Tables (created via the SQL migration in scripts/migrate.sql):
 *   settings, admin, sessions, limits,
 *   groups, assets, entries, messages
 *
 * Storage: private Supabase Storage bucket (SUPABASE_STORAGE_BUCKET)
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase, BUCKET } from "./supabase.ts";
import { HttpError } from "./security.ts";
import type { Json, Row } from "./database.types.ts";
import type {
  Asset,
  Entry,
  EntryKind,
  GroupSummary,
  Settings,
  SocialLink,
} from "./types.ts";

// ─── defaults ────────────────────────────────────────────────────────────────
export const defaults: Settings = {
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
  journalTitle: "Thoughts & process",
  journalDescription:
    "Notes from the studio on design, process, and the ideas behind the work.",
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
function check(error: PostgrestError | null, context: string): void {
  if (error) {
    console.error(`[db] ${context}`, error);
    throw new Error(error.message || "Database error");
  }
}

// ─── settings ─────────────────────────────────────────────────────────────────
const isLink = (v: unknown): v is SocialLink =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as SocialLink).label === "string" &&
  typeof (v as SocialLink).url === "string";

/** Keeps only stored values whose type matches the default's. */
function fromJson(stored: Json): Partial<Settings> {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored))
    return {};
  const out: Record<string, unknown> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = stored[key];
    if (key === "socialLinks") {
      if (Array.isArray(value)) out[key] = value.filter(isLink);
    } else if (typeof value === typeof fallback) out[key] = value;
  }
  return out as Partial<Settings>;
}

export async function getSettings(): Promise<Settings> {
  const { data, error } = await supabase()
    .from("settings")
    .select("data")
    .eq("id", 1)
    .maybeSingle();
  check(error, "getSettings");
  if (!data) {
    // seed defaults on first run
    await supabase().from("settings").insert({ id: 1, data: defaults });
    return { ...defaults };
  }
  return { ...defaults, ...fromJson(data.data) };
}

export async function saveSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const merged: Settings = { ...(await getSettings()), ...patch };
  const { error } = await supabase()
    .from("settings")
    .upsert({ id: 1, data: merged });
  check(error, "saveSettings");
  return merged;
}

// ─── groups ───────────────────────────────────────────────────────────────────
/**
 * Collections in display order, each with its image count and cover
 * (the chosen cover, else the first image). Published only unless `all`.
 */
export async function groups(all = false): Promise<GroupSummary[]> {
  let q = supabase().from("groups").select("*");
  if (!all) q = q.eq("published", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  check(error, "groups");
  const list = data ?? [];
  if (!list.length) return [];

  const { data: images, error: imgErr } = await supabase()
    .from("assets")
    .select("id, group_id")
    .in(
      "group_id",
      list.map((g) => g.id),
    )
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  check(imgErr, "groups/assets");

  return list.map((g) => {
    const own = (images ?? []).filter((a) => a.group_id === g.id);
    return {
      ...g,
      image_count: own.length,
      image_id: g.cover_id || own[0]?.id || "",
    };
  });
}

// ─── assets ───────────────────────────────────────────────────────────────────
export async function assets(groupId: string): Promise<Asset[]> {
  const { data, error } = await supabase()
    .from("assets")
    .select("*")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  check(error, "assets");
  return data ?? [];
}

// ─── entries ──────────────────────────────────────────────────────────────────
export async function entries(kind: EntryKind, all = false): Promise<Entry[]> {
  let q = supabase().from("entries").select("*").eq("kind", kind);
  if (!all) q = q.eq("published", true);
  const { data, error } = await q
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  check(error, "entries");
  return data ?? [];
}

// ─── articles ─────────────────────────────────────────────────────────────────
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Published articles, newest first. */
export async function articles(limit?: number): Promise<Entry[]> {
  let q = supabase()
    .from("entries")
    .select("*")
    .eq("kind", "article")
    .eq("published", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (limit) q = q.limit(limit);
  const { data, error } = await q;
  check(error, "articles");
  return data ?? [];
}

/** An article by slug, or by id for links made before slugs existed. */
export async function findArticle(slugOrId: string): Promise<Entry | null> {
  const bySlug = await supabase()
    .from("entries")
    .select("*")
    .eq("kind", "article")
    .eq("slug", slugOrId)
    .maybeSingle();
  check(bySlug.error, "findArticle");
  if (bySlug.data || !uuidPattern.test(slugOrId)) return bySlug.data;
  const byId = await supabase()
    .from("entries")
    .select("*")
    .eq("kind", "article")
    .eq("id", slugOrId)
    .maybeSingle();
  check(byId.error, "findArticle");
  return byId.data;
}

// ─── generic find ─────────────────────────────────────────────────────────────
const finders = {
  groups: (id: string) =>
    supabase().from("groups").select("*").eq("id", id).maybeSingle(),
  assets: (id: string) =>
    supabase().from("assets").select("*").eq("id", id).maybeSingle(),
  entries: (id: string) =>
    supabase().from("entries").select("*").eq("id", id).maybeSingle(),
  messages: (id: string) =>
    supabase().from("messages").select("*").eq("id", id).maybeSingle(),
};
type IdTable = keyof typeof finders;

/** Fetch a row by id, or throw a 404 HttpError if it doesn't exist. */
export async function findById<T extends IdTable>(
  table: T,
  id: unknown,
): Promise<Row<T>> {
  if (typeof id !== "string" || !id)
    throw new HttpError("This item no longer exists.", 404);
  const { data, error } = await finders[table](id);
  check(error, `findById(${table})`);
  if (!data) throw new HttpError("This item no longer exists.", 404);
  return data as Row<T>;
}

// ─── storage helpers ──────────────────────────────────────────────────────────
/**
 * Create a one-time URL the admin's browser can PUT a file to directly,
 * so large uploads never pass through the app server (Vercel functions
 * accept at most ~4.5 MB per request).
 */
export async function storageUploadUrl(filename: string): Promise<string> {
  const { data, error } = await supabase()
    .storage.from(BUCKET)
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
export async function storageSignedUrl(
  filename: string,
  seconds: number,
  download?: string,
): Promise<string | null> {
  const { data, error } = await supabase()
    .storage.from(BUCKET)
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
export async function storageInspect(
  filename: string,
  bytes = 64,
): Promise<{ size: number; head: Buffer } | null> {
  const url = await storageSignedUrl(filename, 60);
  if (!url) return null;
  const r = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!r.ok) return null;
  const total = r.headers.get("content-range")?.split("/")[1];
  const size = Number(total ?? r.headers.get("content-length"));
  // read only what we need, even if the server ignored the Range header
  if (!r.body) return null;
  const reader = r.body.getReader();
  const parts: Uint8Array[] = [];
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
export async function storageDelete(filename: string): Promise<void> {
  if (!filename) return;
  const { error } = await supabase().storage.from(BUCKET).remove([filename]);
  if (error) console.error("[storage] delete failed", filename, error);
}

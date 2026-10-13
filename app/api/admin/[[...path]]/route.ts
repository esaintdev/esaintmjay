import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../../../../lib/supabase.ts";
import {
  getSettings,
  saveSettings,
  defaults,
  findById,
  groups,
  storageUploadUrl,
  storageInspect,
  storageDelete,
} from "../../../../lib/db.ts";
import { requireAdmin } from "../../../../lib/auth.ts";
import {
  checkOrigin,
  jsonBody,
  text,
  email,
  safeUrl,
  fileType,
  errorResponse,
  HttpError,
  verifyPassword,
  passwordHash,
  type Body,
} from "../../../../lib/security.ts";
import {
  isEntryKind,
  type AdminData,
  type AssetKind,
  type Settings,
} from "../../../../lib/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };
type Method = "POST" | "PUT" | "DELETE";

const reply = (v: object) =>
  Response.json(v, { headers: { "Cache-Control": "no-store" } });
const fail = (e: unknown) =>
  errorResponse(e, "Could not save this change. Please try again.");

/** Throws if a Supabase write failed, so the admin never sees a false "saved". */
async function written(q: PromiseLike<{ error: PostgrestError | null }>) {
  const { error } = await q;
  if (error) throw new Error(error.message);
}

const flag = (x: unknown): boolean => x === true || x === 1;
const order = (x: unknown): number =>
  Number.isSafeInteger(Number(x))
    ? Math.max(-10000, Math.min(10000, Number(x)))
    : 0;

// Uploads go straight from the browser to Supabase Storage (see the
// "upload" routes below), so these limits are not bound by the ~4.5 MB
// request cap of Vercel functions.
const imageMimes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const uploadKinds: Record<AssetKind, { max: number; mimes: string[] }> = {
  work: { max: 15 * 1024 * 1024, mimes: imageMimes },
  portrait: { max: 15 * 1024 * 1024, mimes: imageMimes },
  cv: { max: 10 * 1024 * 1024, mimes: ["application/pdf"] },
};
const isAssetKind = (v: unknown): v is AssetKind =>
  typeof v === "string" && Object.hasOwn(uploadKinds, v);
const extensions: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const wrongType = (kind: AssetKind) =>
  kind === "cv"
    ? "Please upload a PDF CV."
    : "Use a PNG, JPG, WebP, or GIF image.";

// ─── GET /api/admin ──────────────────────────────────────────────────────────
export async function GET(_request: Request, { params }: Context) {
  try {
    await requireAdmin();
    if (((await params).path ?? []).length)
      throw new HttpError("Not found.", 404);

    const [settings, groupList, assetsRes, entriesRes, messagesRes, adminRes] =
      await Promise.all([
        getSettings(),
        groups(true),
        supabase().from("assets").select("*").order("sort_order").order("id"),
        supabase()
          .from("entries")
          .select("*")
          .order("sort_order")
          .order("created_at", { ascending: false }),
        supabase()
          .from("messages")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase().from("admin").select("email").eq("id", 1).maybeSingle(),
      ]);
    for (const r of [assetsRes, entriesRes, messagesRes, adminRes])
      if (r.error) throw new Error(r.error.message);

    const data: AdminData = {
      settings,
      groups: groupList,
      assets: assetsRes.data ?? [],
      entries: entriesRes.data ?? [],
      messages: messagesRes.data ?? [],
      adminEmail: adminRes.data?.email ?? "",
    };
    return reply(data);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(r: Request, c: Context) {
  return mutate(r, c, "POST");
}
export async function PUT(r: Request, c: Context) {
  return mutate(r, c, "PUT");
}
export async function DELETE(r: Request, c: Context) {
  return mutate(r, c, "DELETE");
}

// ─── mutations ───────────────────────────────────────────────────────────────
async function mutate(request: Request, { params }: Context, method: Method) {
  try {
    checkOrigin(request);
    await requireAdmin();
    const [resource, id] = (await params).path ?? [];
    const v: Body = method === "DELETE" ? {} : await jsonBody(request);

    if (resource === "upload" && method === "POST")
      return reply(
        id === "complete" ? await completeUpload(v) : await startUpload(v),
      );
    if (resource === "settings" && method === "PUT")
      return reply(await updateSettings(v));
    if (resource === "groups") return reply(await saveGroup(method, id, v));
    if (resource === "assets" && method !== "POST")
      return reply(await saveAsset(method, id, v));
    if (resource === "entries") return reply(await saveEntry(method, id, v));
    if (resource === "messages" && method !== "POST")
      return reply(await saveMessage(method, id, v));
    if (resource === "reorder" && method === "POST")
      return reply(await reorder(v));
    if (resource === "password" && method === "PUT")
      return reply(await changePassword(v));

    throw new HttpError("Not found.", 404);
  } catch (e) {
    return fail(e);
  }
}

// ── upload, step 1: get a one-time upload URL ─────────────────────────────────
// body: { kind, groupId?, name, type, size }
async function startUpload(v: Body) {
  if (!isAssetKind(v.kind)) throw new HttpError("Unknown upload type.");
  const rule = uploadKinds[v.kind];
  if (v.kind === "work") await findById("groups", v.groupId);
  if (typeof v.type !== "string" || !rule.mimes.includes(v.type))
    throw new HttpError(wrongType(v.kind));
  if (
    typeof v.size !== "number" ||
    !Number.isSafeInteger(v.size) ||
    v.size < 16
  )
    throw new HttpError("This file is empty or unreadable.");
  if (v.size > rule.max) throw new HttpError("The upload is too large.", 413);

  const assetId = randomUUID(),
    filename = `${assetId}.${extensions[v.type]}`;
  return { id: assetId, filename, uploadUrl: await storageUploadUrl(filename) };
}

// ── upload, step 2: verify the uploaded file and save it ─────────────────────
// body: { id, filename, kind, groupId?, name }
async function completeUpload(v: Body) {
  if (!isAssetKind(v.kind)) throw new HttpError("Unknown upload type.");
  const kind = v.kind,
    rule = uploadKinds[kind];
  const groupId =
    kind === "work" ? (await findById("groups", v.groupId)).id : null;

  const assetId = String(v.id ?? "");
  const ext =
    String(v.filename ?? "")
      .split(".")
      .pop() ?? "";
  const filename = `${assetId}.${ext}`;
  if (
    !uuid.test(assetId) ||
    filename !== v.filename ||
    !Object.values(extensions).includes(ext)
  )
    throw new HttpError("Invalid upload.");

  const { data: taken } = await supabase()
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .maybeSingle();
  if (taken) throw new HttpError("Invalid upload.");

  // Check what actually arrived in storage: size and file signature.
  const stored = await storageInspect(filename);
  if (!stored)
    throw new HttpError("The upload did not finish. Please try again.");
  const type = fileType(stored.head);
  if (
    !type ||
    type.ext !== ext ||
    !rule.mimes.includes(type.mime) ||
    !(stored.size > 0 && stored.size <= rule.max)
  ) {
    await storageDelete(filename);
    throw new HttpError(
      stored.size > rule.max ? "The upload is too large." : wrongType(kind),
    );
  }

  const original = text(v.name, 200) || "Untitled",
    title = original.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

  // next sort position
  let last = supabase().from("assets").select("sort_order");
  last = groupId ? last.eq("group_id", groupId) : last.is("group_id", null);
  const { data: sortData } = await last
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort = sortData ? sortData.sort_order + 1 : 0;

  const { error: insertErr } = await supabase().from("assets").insert({
    id: assetId,
    group_id: groupId,
    kind,
    filename,
    mime: type.mime,
    bytes: stored.size,
    title,
    alt: title,
    sort_order: sort,
  });
  if (insertErr) {
    await storageDelete(filename);
    throw new Error(insertErr.message);
  }

  // portrait or CV: point settings at the new file and remove the old one
  if (kind !== "work") {
    const key = kind === "cv" ? "cvId" : "portraitId";
    const oldId = (await getSettings())[key];
    let oldFilename: string | undefined;
    if (oldId) {
      const { data: oldAsset } = await supabase()
        .from("assets")
        .select("filename")
        .eq("id", oldId)
        .maybeSingle();
      oldFilename = oldAsset?.filename;
      await written(supabase().from("assets").delete().eq("id", oldId));
    }
    await saveSettings({ [key]: assetId });
    if (oldFilename) await storageDelete(oldFilename);
  }

  return { id: assetId };
}

// ── settings ──────────────────────────────────────────────────────────────────
const longText = new Set<string>([
  "aboutBody",
  "aboutIntro",
  "heroDescription",
  "contactDescription",
  "workDescription",
]);
const requiredText = new Set<string>(["name", "heroTitle", "seoTitle"]);
const isSettingsKey = (k: string): k is keyof Settings =>
  Object.hasOwn(defaults, k);

async function updateSettings(v: Body) {
  const patch: Partial<Settings> = {};
  const set = <K extends keyof Settings>(k: K, value: Settings[K]) => {
    patch[k] = value;
  };
  for (const [key, value] of Object.entries(v)) {
    // portrait and CV change only through uploads and deletions
    if (!isSettingsKey(key) || key === "portraitId" || key === "cvId") continue;
    if (key === "socialLinks") {
      if (!Array.isArray(value) || value.length > 10)
        throw new HttpError("Add up to 10 social links.");
      set(
        key,
        value
          .map((a: unknown) => {
            const link = (typeof a === "object" && a !== null ? a : {}) as Body;
            return {
              label: text(link.label, 50, true),
              url: safeUrl(link.url),
            };
          })
          .filter((a) => a.url),
      );
    } else if (typeof defaults[key] === "boolean") set(key, !!value);
    else if (key === "email") set(key, value ? email(value) : "");
    else if (key === "accent") {
      if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
        throw new HttpError("Use a six-digit hex colour.");
      set(key, value);
    } else
      set(
        key,
        text(value, longText.has(key) ? 4000 : 500, requiredText.has(key)),
      );
  }
  await saveSettings(patch);
  return { ok: true };
}

// ── groups ────────────────────────────────────────────────────────────────────
async function saveGroup(method: Method, id: string | undefined, v: Body) {
  if (method === "DELETE") {
    const g = await findById("groups", id);
    const { data: files } = await supabase()
      .from("assets")
      .select("filename")
      .eq("group_id", g.id);
    await written(supabase().from("groups").delete().eq("id", g.id)); // cascade deletes assets
    for (const f of files ?? []) await storageDelete(f.filename);
    return { ok: true };
  }

  const previous = method === "PUT" ? await findById("groups", id) : null;
  const name = text(v.name, 150, true);
  const slug = text(
    v.slug ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    180,
    true,
  );
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new HttpError(
      "Use lowercase letters, numbers, and hyphens for the URL slug.",
    );

  const { data: existing } = await supabase()
    .from("groups")
    .select("id")
    .eq("slug", slug)
    .neq("id", previous?.id ?? "")
    .maybeSingle();
  if (existing) throw new HttpError("That URL slug is already in use.");

  const cover = text(v.cover_id, 100);
  if (cover) {
    const { data: coverAsset } = await supabase()
      .from("assets")
      .select("id")
      .eq("id", cover)
      .eq("group_id", previous?.id ?? "")
      .maybeSingle();
    if (!coverAsset)
      throw new HttpError("Choose a cover from this collection.");
  }

  const payload = {
    slug,
    name,
    category: text(v.category, 150),
    description: text(v.description, 6000),
    year: text(v.year, 50),
    role: text(v.role, 150),
    published: flag(v.published),
    featured: flag(v.featured),
    sort_order: order(v.sort_order),
    cover_id: cover,
  };

  if (previous) {
    await written(
      supabase().from("groups").update(payload).eq("id", previous.id),
    );
    return { ok: true };
  }
  const newId = randomUUID();
  await written(
    supabase()
      .from("groups")
      .insert({ ...payload, id: newId, created_at: new Date().toISOString() }),
  );
  return { id: newId };
}

// ── assets ────────────────────────────────────────────────────────────────────
async function saveAsset(method: Method, id: string | undefined, v: Body) {
  const a = await findById("assets", id);

  if (method === "DELETE") {
    // clear cover references
    await written(
      supabase().from("groups").update({ cover_id: "" }).eq("cover_id", a.id),
    );
    // clear portrait/CV in settings
    const s = await getSettings();
    const patch: Partial<Settings> = {};
    if (s.cvId === a.id) patch.cvId = "";
    if (s.portraitId === a.id) patch.portraitId = "";
    if (Object.keys(patch).length) await saveSettings(patch);

    await written(supabase().from("assets").delete().eq("id", a.id));
    await storageDelete(a.filename);
    return { ok: true };
  }

  await written(
    supabase()
      .from("assets")
      .update({
        title: text(v.title, 200, true),
        alt: text(v.alt, 500, true),
        caption: text(v.caption, 2000),
        sort_order: order(v.sort_order),
      })
      .eq("id", a.id),
  );
  return { ok: true };
}

// ── entries ───────────────────────────────────────────────────────────────────
async function saveEntry(method: Method, id: string | undefined, v: Body) {
  if (method === "DELETE") {
    const e = await findById("entries", id);
    await written(supabase().from("entries").delete().eq("id", e.id));
    return { ok: true };
  }
  if (!isEntryKind(v.kind)) throw new HttpError("Unknown content section.");

  const payload = {
    kind: v.kind,
    title: text(v.title, 200, true),
    subtitle: text(v.subtitle, 300),
    body: text(v.body, 30000),
    extra: text(v.extra, 200),
    published: flag(v.published),
    sort_order: order(v.sort_order),
  };

  if (method === "PUT") {
    const e = await findById("entries", id);
    await written(supabase().from("entries").update(payload).eq("id", e.id));
  } else {
    await written(
      supabase()
        .from("entries")
        .insert({
          ...payload,
          id: randomUUID(),
          created_at: new Date().toISOString(),
        }),
    );
  }
  return { ok: true };
}

// ── messages ──────────────────────────────────────────────────────────────────
async function saveMessage(method: Method, id: string | undefined, v: Body) {
  const m = await findById("messages", id);
  if (method === "DELETE")
    await written(supabase().from("messages").delete().eq("id", m.id));
  else
    await written(
      supabase()
        .from("messages")
        .update({ is_read: flag(v.is_read) })
        .eq("id", m.id),
    );
  return { ok: true };
}

// ── reorder ───────────────────────────────────────────────────────────────────
const setOrder = {
  groups: (id: string, i: number) =>
    supabase().from("groups").update({ sort_order: i }).eq("id", id),
  assets: (id: string, i: number) =>
    supabase().from("assets").update({ sort_order: i }).eq("id", id),
  entries: (id: string, i: number) =>
    supabase().from("entries").update({ sort_order: i }).eq("id", id),
};
const orderable = Object.keys(setOrder) as (keyof typeof setOrder)[];

async function reorder(v: Body) {
  const table = orderable.find((t) => t === v.resource);
  const ids = v.ids;
  if (
    !table ||
    !Array.isArray(ids) ||
    ids.length > 1000 ||
    !ids.every((i): i is string => typeof i === "string") ||
    new Set(ids).size !== ids.length
  )
    throw new HttpError("Invalid ordering.");

  await Promise.all(
    ids.map(async (itemId, i) => {
      await findById(table, itemId);
      await written(setOrder[table](itemId, i));
    }),
  );
  return { ok: true };
}

// ── password ──────────────────────────────────────────────────────────────────
async function changePassword(v: Body) {
  const { data: a } = await supabase()
    .from("admin")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!a) throw new HttpError("Admin account not found.", 404);
  if (!(await verifyPassword(v.current, a.password)))
    throw new HttpError("The current password is incorrect.", 403);
  const hash = await passwordHash(v.password);
  await written(
    supabase()
      .from("admin")
      .update({ password: hash, email: email(v.email) })
      .eq("id", 1),
  );
  await written(supabase().from("sessions").delete().neq("token", "")); // sign out all
  return { ok: true };
}

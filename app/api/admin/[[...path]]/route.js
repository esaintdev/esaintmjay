import { randomUUID } from "node:crypto";
import { supabase, BUCKET } from "../../../../lib/supabase.mjs";
import {
  getSettings,
  saveSettings,
  defaults,
  findById,
  storageUploadUrl,
  storageInspect,
  storageDelete,
} from "../../../../lib/db.mjs";
import { requireAdmin } from "../../../../lib/auth";
import {
  checkOrigin,
  jsonBody,
  text,
  email,
  safeUrl,
  fileType,
  HttpError,
  verifyPassword,
  passwordHash,
  hashToken,
} from "../../../../lib/security.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kinds = ["service", "award", "experience", "article"];
const reply = (v) =>
  Response.json(v, { headers: { "Cache-Control": "no-store" } });
const fail = (e) => {
  if (!e.status) console.error(e);
  return Response.json(
    {
      error: e.status
        ? e.message
        : "Could not save this change. Please try again.",
    },
    { status: e.status || 500 },
  );
};
// Uploads go straight from the browser to Supabase Storage (see the
// "upload" routes below), so these limits are not bound by the ~4.5 MB
// request cap of Vercel functions.
const uploadKinds = {
  work: { max: 15 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
  portrait: { max: 15 * 1024 * 1024, mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
  cv: { max: 10 * 1024 * 1024, mimes: ["application/pdf"] },
};
const extensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const flag = (x) => (x === true || x === 1 ? true : false);
const order = (x) =>
  Number.isSafeInteger(Number(x))
    ? Math.max(-10000, Math.min(10000, Number(x)))
    : 0;

// ─── GET /api/admin ──────────────────────────────────────────────────────────
export async function GET(request, { params }) {
  try {
    await requireAdmin();
    if (((await params).path || []).length)
      throw new HttpError("Not found.", 404);

    const [settingsRow, groupsData, assetsData, entriesData, messagesData, adminData] =
      await Promise.all([
        getSettings(),
        supabase()
          .from("groups")
          .select("*, assets(count)")
          .order("sort_order")
          .order("created_at", { ascending: false }),
        supabase()
          .from("assets")
          .select("*")
          .order("sort_order")
          .order("id"),
        supabase()
          .from("entries")
          .select("*")
          .order("sort_order")
          .order("created_at", { ascending: false }),
        supabase()
          .from("messages")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase()
          .from("admin")
          .select("email")
          .eq("id", 1)
          .maybeSingle(),
      ]);

    return reply({
      settings: settingsRow,
      groups: (groupsData.data || []).map((g) => ({
        ...g,
        image_count: g.assets?.[0]?.count ?? 0,
        assets: undefined,
      })),
      assets: assetsData.data || [],
      entries: entriesData.data || [],
      messages: messagesData.data || [],
      adminEmail: adminData.data?.email,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(r, c) {
  return mutate(r, c, "POST");
}
export async function PUT(r, c) {
  return mutate(r, c, "PUT");
}
export async function DELETE(r, c) {
  return mutate(r, c, "DELETE");
}

// ─── mutations ───────────────────────────────────────────────────────────────
async function mutate(request, { params }, method) {
  try {
    checkOrigin(request);
    await requireAdmin();
    const [resource, id] = (await params).path || [];

    const v = method === "DELETE" ? {} : await jsonBody(request);

    // ── upload, step 1: get a one-time upload URL ───────────────────────────
    // body: { kind, groupId?, name, type, size }
    if (resource === "upload" && !id && method === "POST") {
      const rule = Object.hasOwn(uploadKinds, v.kind) && uploadKinds[v.kind];
      if (!rule) throw new HttpError("Unknown upload type.");
      if (v.kind === "work") await findById("groups", v.groupId);
      if (!rule.mimes.includes(v.type))
        throw new HttpError(
          v.kind === "cv"
            ? "Please upload a PDF CV."
            : "Use a PNG, JPG, WebP, or GIF image.",
        );
      if (!Number.isSafeInteger(v.size) || v.size < 16)
        throw new HttpError("This file is empty or unreadable.");
      if (v.size > rule.max) throw new HttpError("The upload is too large.", 413);

      const assetId = randomUUID(),
        filename = `${assetId}.${extensions[v.type]}`;
      return reply({
        id: assetId,
        filename,
        uploadUrl: await storageUploadUrl(filename),
      });
    }

    // ── upload, step 2: verify the uploaded file and save it ───────────────
    // body: { id, filename, kind, groupId?, name }
    if (resource === "upload" && id === "complete" && method === "POST") {
      const rule = Object.hasOwn(uploadKinds, v.kind) && uploadKinds[v.kind];
      if (!rule) throw new HttpError("Unknown upload type.");
      const groupId = v.kind === "work" ? v.groupId : null;
      if (v.kind === "work") await findById("groups", groupId);

      const assetId = String(v.id || "");
      const ext = String(v.filename || "").split(".").pop();
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
      if (!stored) throw new HttpError("The upload did not finish. Please try again.");
      const type = fileType(stored.head);
      if (
        !type ||
        type.ext !== ext ||
        !rule.mimes.includes(type.mime) ||
        !(stored.size > 0 && stored.size <= rule.max)
      ) {
        await storageDelete(filename);
        throw new HttpError(
          stored.size > rule.max
            ? "The upload is too large."
            : v.kind === "cv"
              ? "Please upload a PDF CV."
              : "Use a PNG, JPG, WebP, or GIF image.",
        );
      }

      const original = text(v.name || "Untitled", 200) || "Untitled",
        title = original.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

      // next sort position
      let last = supabase().from("assets").select("sort_order");
      last = groupId ? last.eq("group_id", groupId) : last.is("group_id", null);
      const { data: sortData } = await last
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort = sortData ? sortData.sort_order + 1 : 0;

      const { error: insertErr } = await supabase()
        .from("assets")
        .insert({
          id: assetId,
          group_id: groupId,
          kind: v.kind,
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

      // if portrait or cv, update settings and remove old asset
      if (v.kind !== "work") {
        const key = v.kind === "cv" ? "cvId" : "portraitId";
        const settings = await getSettings();
        const oldId = settings[key];

        let oldFilename;
        if (oldId) {
          const { data: oldAsset } = await supabase()
            .from("assets")
            .select("filename")
            .eq("id", oldId)
            .maybeSingle();
          oldFilename = oldAsset?.filename;
          await supabase().from("assets").delete().eq("id", oldId);
        }

        await saveSettings({ [key]: assetId });
        if (oldFilename) await storageDelete(oldFilename);
      }

      return reply({ id: assetId });
    }

    // ── settings ─────────────────────────────────────────────────────────────
    if (resource === "settings" && method === "PUT") {
      const s = await getSettings();
      for (const [key, value] of Object.entries(v)) {
        if (!(key in defaults) || ["portraitId", "cvId"].includes(key))
          continue;
        if (key === "socialLinks") {
          if (!Array.isArray(value) || value.length > 10)
            throw new HttpError("Add up to 10 social links.");
          s[key] = value
            .map((a) => ({
              label: text(a.label, 50, true),
              url: safeUrl(a.url),
            }))
            .filter((a) => a.url);
        } else if (typeof defaults[key] === "boolean") s[key] = !!value;
        else if (key === "email") s[key] = value ? email(value) : "";
        else if (key === "accent") {
          if (!/^#[0-9a-f]{6}$/i.test(value))
            throw new HttpError("Use a six-digit hex colour.");
          s[key] = value;
        } else
          s[key] = text(
            value,
            [
              "aboutBody",
              "aboutIntro",
              "heroDescription",
              "contactDescription",
              "workDescription",
            ].includes(key)
              ? 4000
              : 500,
            ["name", "heroTitle", "seoTitle"].includes(key),
          );
      }
      await saveSettings(s);
      return reply({ ok: true });
    }

    // ── groups ────────────────────────────────────────────────────────────────
    if (resource === "groups") {
      if (method === "DELETE") {
        await findById("groups", id);
        const { data: files } = await supabase()
          .from("assets")
          .select("filename")
          .eq("group_id", id);
        await supabase().from("groups").delete().eq("id", id); // cascade deletes assets
        for (const f of files || []) await storageDelete(f.filename);
        return reply({ ok: true });
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
        .neq("id", id || "")
        .maybeSingle();
      if (existing) throw new HttpError("That URL slug is already in use.");

      const cover = text(v.cover_id, 100);
      if (cover) {
        const { data: coverAsset } = await supabase()
          .from("assets")
          .select("id")
          .eq("id", cover)
          .eq("group_id", id || "")
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
        await supabase().from("groups").update(payload).eq("id", id);
      } else {
        const newId = randomUUID();
        const { error } = await supabase()
          .from("groups")
          .insert({ ...payload, id: newId, created_at: new Date().toISOString() });
        if (error) throw new Error(error.message);
        return reply({ id: newId });
      }
      return reply({ ok: true });
    }

    // ── assets ────────────────────────────────────────────────────────────────
    if (resource === "assets") {
      const a = await findById("assets", id);

      if (method === "DELETE") {
        // clear cover_id references
        await supabase()
          .from("groups")
          .update({ cover_id: "" })
          .eq("cover_id", id);

        // clear portrait/cv in settings
        const s = await getSettings();
        const patch = {};
        if (s.cvId === id) patch.cvId = "";
        if (s.portraitId === id) patch.portraitId = "";
        if (Object.keys(patch).length) await saveSettings(patch);

        await supabase().from("assets").delete().eq("id", id);
        await storageDelete(a.filename);
        return reply({ ok: true });
      }

      if (method === "PUT") {
        await supabase()
          .from("assets")
          .update({
            title: text(v.title, 200, true),
            alt: text(v.alt, 500, true),
            caption: text(v.caption, 2000),
            sort_order: order(v.sort_order),
          })
          .eq("id", id);
        return reply({ ok: true });
      }
    }

    // ── entries ───────────────────────────────────────────────────────────────
    if (resource === "entries") {
      if (method === "DELETE") {
        await findById("entries", id);
        await supabase().from("entries").delete().eq("id", id);
        return reply({ ok: true });
      }
      if (!kinds.includes(v.kind))
        throw new HttpError("Unknown content section.");

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
        await findById("entries", id);
        await supabase().from("entries").update(payload).eq("id", id);
      } else if (method === "POST") {
        const { error } = await supabase()
          .from("entries")
          .insert({ ...payload, id: randomUUID(), created_at: new Date().toISOString() });
        if (error) throw new Error(error.message);
      } else throw new HttpError("Not allowed.", 405);
      return reply({ ok: true });
    }

    // ── messages ──────────────────────────────────────────────────────────────
    if (resource === "messages") {
      await findById("messages", id);
      if (method === "DELETE") {
        await supabase().from("messages").delete().eq("id", id);
      } else if (method === "PUT") {
        await supabase()
          .from("messages")
          .update({ is_read: flag(v.is_read) })
          .eq("id", id);
      } else throw new HttpError("Not allowed.", 405);
      return reply({ ok: true });
    }

    // ── reorder ───────────────────────────────────────────────────────────────
    if (resource === "reorder" && method === "POST") {
      const table = { groups: "groups", assets: "assets", entries: "entries" }[
        v.resource
      ];
      if (
        !table ||
        !Array.isArray(v.ids) ||
        v.ids.length > 1000 ||
        new Set(v.ids).size !== v.ids.length
      )
        throw new HttpError("Invalid ordering.");

      // batch update sort_order
      await Promise.all(
        v.ids.map(async (itemId, i) => {
          await findById(table, itemId);
          await supabase()
            .from(table)
            .update({ sort_order: i })
            .eq("id", itemId);
        }),
      );
      return reply({ ok: true });
    }

    // ── password ──────────────────────────────────────────────────────────────
    if (resource === "password" && method === "PUT") {
      const { data: a } = await supabase()
        .from("admin")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (!a) throw new HttpError("Admin account not found.", 404);
      if (!(await verifyPassword(v.current, a.password)))
        throw new HttpError("The current password is incorrect.", 403);
      const hash = await passwordHash(v.password);
      await supabase()
        .from("admin")
        .update({ password: hash, email: email(v.email) })
        .eq("id", 1);
      await supabase().from("sessions").delete().neq("token", ""); // sign out all
      return reply({ ok: true });
    }

    throw new HttpError("Not found.", 404);
  } catch (e) {
    return fail(e);
  }
}

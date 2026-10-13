import { randomUUID } from "node:crypto";
import { supabase, BUCKET } from "../../../../lib/supabase.mjs";
import {
  getSettings,
  saveSettings,
  defaults,
  findById,
  storageUpload,
  storageDelete,
} from "../../../../lib/db.mjs";
import { requireAdmin } from "../../../../lib/auth";
import {
  checkOrigin,
  jsonBody,
  readBody,
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

    // ── upload ──────────────────────────────────────────────────────────────
    if (resource === "upload" && method === "POST") {
      const u = new URL(request.url),
        kind = u.searchParams.get("kind"),
        groupId = u.searchParams.get("groupId");

      if (!["work", "portrait", "cv"].includes(kind))
        throw new HttpError("Unknown upload type.");
      if (kind === "work") await findById("groups", groupId);

      const b = await readBody(
          request,
          (kind === "cv" ? 10 : 15) * 1024 * 1024,
        ),
        type = fileType(b);

      if (
        !type ||
        (kind === "cv"
          ? type.mime !== "application/pdf"
          : !type.mime.startsWith("image/"))
      )
        throw new HttpError(
          kind === "cv"
            ? "Please upload a PDF CV."
            : "Use a PNG, JPG, WebP, or GIF image.",
        );

      const assetId = randomUUID(),
        filename = `${assetId}.${type.ext}`,
        original = text(u.searchParams.get("name") || "Untitled", 200),
        title = original.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");

      // upload to Supabase Storage
      await storageUpload(filename, b, type.mime);

      // get current sort order
      const { data: sortData } = await supabase()
        .from("assets")
        .select("sort_order")
        .is("group_id", kind === "work" ? groupId : null)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sort = sortData ? sortData.sort_order + 1 : 0;

      // insert asset row
      const { error: insertErr } = await supabase()
        .from("assets")
        .insert({
          id: assetId,
          group_id: kind === "work" ? groupId : null,
          kind,
          filename,
          mime: type.mime,
          bytes: b.length,
          title,
          alt: title,
          sort_order: sort,
        });

      if (insertErr) {
        await storageDelete(filename);
        throw new Error(insertErr.message);
      }

      // if portrait or cv, update settings and remove old asset
      if (kind !== "work") {
        const key = kind === "cv" ? "cvId" : "portraitId";
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

    const v = method === "DELETE" ? {} : await jsonBody(request);

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

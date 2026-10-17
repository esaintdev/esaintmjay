/**
 * lib/calmify.ts
 * ---------------------------------------------------------
 * Receives articles published from Calmify and saves them as this site's
 * articles (entries of kind 'article'), so they appear at /journal/<slug>
 * like any other.
 *
 * Calmify calls `save` once per post and `findByKey` before it, so a retry
 * never creates a second article. Both are wired to the route in
 * app/api/calmify/route.ts.
 *
 * The body arrives as sanitized HTML (see lib/calmify-html.ts) because this
 * site stores articles as a structured document, not HTML. Every image is
 * rehosted in our own private bucket — the cover arrives as checked bytes,
 * and the images inside the text are downloaded from Calmify's asset host
 * and re-uploaded here, so nothing on the page points back at Calmify.
 */
import { randomUUID } from "node:crypto";
import type { CalmifyPost } from "@calmify/next";
import { supabase, BUCKET } from "./supabase.ts";
import { storageDelete } from "./db.ts";
import { sanitizeDoc, plainText, imageIds } from "./richtext.ts";
import type { RichDoc, RichNode } from "./richtext.ts";
import { htmlToRichDoc } from "./calmify-html.ts";
import { articlePath, siteUrl } from "./seo.ts";
import { fileType, HttpError } from "./security.ts";
import type { Entry } from "./types.ts";

const imageMimes = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE = 15 * 1024 * 1024;

/** The article saved for this Calmify delivery, as { id, url }, or null. */
export async function calmifyFind(
  key: string,
): Promise<{ id: string; url: string } | null> {
  const { data, error } = await supabase()
    .from("entries")
    .select("id, slug")
    .eq("kind", "article")
    .eq("calmify_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { id: data.id, url: siteUrl(articlePath(data)) };
}

/**
 * Saves one delivered article. Idempotent on the delivery key: a repeat of
 * the same delivery (same key) updates the same article, and a re-publish
 * of an existing Calmify slug updates it in place.
 */
export async function calmifySave(
  post: CalmifyPost,
): Promise<{ id: string; url: string }> {
  const now = new Date().toISOString();

  // Same article already delivered (retry), or already published by Calmify
  // under this slug (an edit). A hand-written article with this slug is left
  // alone: the delivery fails visibly instead of overwriting someone's work.
  let existing: Entry | null = null;
  const byKey = await supabase()
    .from("entries")
    .select("*")
    .eq("kind", "article")
    .eq("calmify_key", post.idempotencyKey)
    .maybeSingle();
  if (byKey.error) throw new Error(byKey.error.message);
  existing = byKey.data;
  if (!existing) {
    const bySlug = await supabase()
      .from("entries")
      .select("*")
      .eq("kind", "article")
      .eq("slug", post.slug)
      .maybeSingle();
    if (bySlug.error) throw new Error(bySlug.error.message);
    if (bySlug.data) {
      if (!bySlug.data.calmify_key)
        throw new HttpError("That URL is already used by another article.", 409);
      existing = bySlug.data;
    }
  }

  const entryId = existing?.id ?? randomUUID();
  let coverId = existing?.cover_id ?? "";
  const created: string[] = []; // every asset this delivery stored

  try {
    // Body: rehost the in-text images, then convert. sanitizeDoc is the
    // final gate that keeps only /media/<id> images and safe formatting.
    const imported = await importImages(htmlToRichDoc(post.contentHtml));
    created.push(...imported.assets);
    const doc = sanitizeDoc(imported.doc);

    // Cover: verify the bytes ourselves too, then store.
    if (post.image) {
      const bytes = Buffer.from(post.image.bytes);
      const type = fileType(bytes);
      if (!type || !imageMimes.includes(type.mime))
        throw new HttpError("The cover image could not be read.", 422);
      coverId = await storeImage(bytes, type, post.image.alt || post.title, post.title);
      created.push(coverId);
    }

    const row = {
      kind: "article",
      title: post.title,
      subtitle: post.metaDescription.slice(0, 300), // the visible deck/summary
      body: plainText(doc).slice(0, 100_000),
      extra: post.category.slice(0, 200), // the article's section label
      published: true,
      sort_order: existing?.sort_order ?? 0,
      slug: post.slug,
      cover_id: coverId,
      seo_title: "", // falls back to the title
      seo_description: post.metaDescription.slice(0, 200),
      content: doc,
      calmify_key: post.idempotencyKey,
      published_at: existing?.published_at ?? now,
    };
    const { error: saveErr } = existing
      ? await supabase().from("entries").update(row).eq("id", entryId)
      : await supabase()
          .from("entries")
          .insert({ ...row, id: entryId, created_at: now });
    if (saveErr) throw new Error(saveErr.message);

    // The new images belong to this article.
    if (created.length) {
      const { error } = await supabase()
        .from("assets")
        .update({ entry_id: entryId })
        .in("id", created);
      if (error) throw new Error(error.message);
    }

    // Delete images the article no longer uses (a replaced cover, or in-text
    // images dropped by an edit).
    const used = new Set([...imageIds(doc), ...(coverId ? [coverId] : [])]);
    const { data: owned, error: ownedErr } = await supabase()
      .from("assets")
      .select("id")
      .eq("entry_id", entryId);
    if (ownedErr) throw new Error(ownedErr.message);
    for (const a of owned ?? []) if (!used.has(a.id)) await removeAsset(a.id);

    return {
      id: entryId,
      url: siteUrl(articlePath({ slug: post.slug, id: entryId })),
    };
  } catch (e) {
    // Leave nothing behind if the article couldn't be saved.
    for (const id of created) await removeAsset(id);
    throw e;
  }
}

// ─── images ─────────────────────────────────────────────────────────────────
/**
 * True for a URL we may download an image from: https, on Calmify's asset
 * host, with no credentials. This is the same rule @calmify/next uses for
 * the cover, so a crafted article can't make our server fetch arbitrary
 * addresses.
 */
function isAssetUrl(url: string): boolean {
  const host = (process.env.CALMIFY_ASSET_HOST || "").trim().toLowerCase();
  if (!host) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname.toLowerCase() === host &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}

/** Uploads image bytes as an article asset (linked to the entry later). */
async function storeImage(
  bytes: Buffer,
  type: { mime: string; ext: string },
  alt: string,
  title: string,
): Promise<string> {
  const assetId = randomUUID();
  const filename = `${assetId}.${type.ext}`;
  const { error: upErr } = await supabase()
    .storage.from(BUCKET)
    .upload(filename, bytes, { contentType: type.mime, upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { error } = await supabase().from("assets").insert({
    id: assetId,
    group_id: null,
    entry_id: null,
    kind: "article",
    filename,
    mime: type.mime,
    bytes: bytes.length,
    title: title.slice(0, 200),
    alt: alt.slice(0, 500),
    caption: "",
    sort_order: 0,
  });
  if (error) {
    await storageDelete(filename);
    throw new Error(error.message);
  }
  return assetId;
}

/**
 * Rehosts the document's in-text images: each one on Calmify's asset host is
 * downloaded, stored in our bucket and rewritten to /media/<id>. An image on
 * another host, or one that can't be fetched or read, is dropped. Returns
 * the rewritten document and the assets it created.
 */
async function importImages(
  doc: RichDoc | null,
): Promise<{ doc: RichDoc | null; assets: string[] }> {
  if (!doc) return { doc: null, assets: [] };

  // Collect the external srcs (with their alt/title) first, then fetch the
  // distinct ones together rather than one after another.
  const wanted = new Map<string, { alt: string; title: string }>();
  const collect = (n: RichNode) => {
    if (n.type === "image") {
      const src = typeof n.attrs?.src === "string" ? n.attrs.src : "";
      if (src && !src.startsWith("/media/") && !wanted.has(src))
        wanted.set(src, {
          alt: String(n.attrs?.alt ?? ""),
          title: String(n.attrs?.title ?? ""),
        });
    }
    (n.content ?? []).forEach(collect);
  };
  doc.content.forEach(collect);

  const assets: string[] = [];
  const resolved = new Map<string, string | null>();
  await Promise.all(
    [...wanted].map(async ([src, meta]) => {
      resolved.set(src, await downloadImage(src, meta, assets));
    }),
  );

  const rewrite = (n: RichNode): RichNode | null => {
    if (n.type === "image") {
      const src = typeof n.attrs?.src === "string" ? n.attrs.src : "";
      if (src.startsWith("/media/")) return n;
      const id = resolved.get(src) ?? null;
      if (!id) return null; // not ours, or download failed
      return { ...n, attrs: { ...n.attrs, src: `/media/${id}` } };
    }
    if (!n.content) return n;
    const content = n.content
      .map(rewrite)
      .filter((c): c is RichNode => c !== null);
    return { ...n, content };
  };

  return {
    doc: {
      type: "doc",
      content: doc.content.map(rewrite).filter((c): c is RichNode => c !== null),
    },
    assets,
  };
}

/** Fetches one in-text image and stores it; returns its asset id or null. */
async function downloadImage(
  src: string,
  meta: { alt: string; title: string },
  assets: string[],
): Promise<string | null> {
  if (!isAssetUrl(src)) return null;
  try {
    const res = await fetch(src, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 200) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_IMAGE) return null;
    const type = fileType(bytes);
    if (!type || !imageMimes.includes(type.mime)) return null;
    const id = await storeImage(bytes, type, meta.alt, meta.title || meta.alt);
    assets.push(id);
    return id;
  } catch (e) {
    console.warn(
      "[calmify] could not import in-text image",
      src,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/** Removes an asset row and its stored file. */
async function removeAsset(id: string): Promise<void> {
  const { data } = await supabase()
    .from("assets")
    .select("filename")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase().from("assets").delete().eq("id", id);
  if (error) {
    console.error("[calmify] could not delete asset", id, error.message);
    return;
  }
  if (data?.filename) await storageDelete(data.filename);
}

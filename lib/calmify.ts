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
 * site stores articles as a structured document, not HTML. The cover
 * arrives as checked image bytes and is uploaded to the private bucket.
 */
import { randomUUID } from "node:crypto";
import type { CalmifyPost } from "@calmify/next";
import { supabase, BUCKET } from "./supabase.ts";
import { storageDelete } from "./db.ts";
import { sanitizeDoc, plainText } from "./richtext.ts";
import { htmlToRichDoc } from "./calmify-html.ts";
import { articlePath, siteUrl } from "./seo.ts";
import { fileType, HttpError } from "./security.ts";
import type { Entry } from "./types.ts";

const coverMimes = ["image/png", "image/jpeg", "image/webp"];

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
  const doc = sanitizeDoc(htmlToRichDoc(post.contentHtml));
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
        throw new HttpError(
          "That URL is already used by another article.",
          409,
        );
      existing = bySlug.data;
    }
  }

  const entryId = existing?.id ?? randomUUID();
  let coverId = existing?.cover_id ?? "";
  let newAssetId: string | null = null;
  let newFilename: string | null = null;

  try {
    // Cover: verify the bytes ourselves too, upload, and record the asset.
    if (post.image) {
      const bytes = Buffer.from(post.image.bytes);
      const type = fileType(bytes);
      if (!type || !coverMimes.includes(type.mime))
        throw new HttpError("The cover image could not be read.", 422);
      newAssetId = randomUUID();
      newFilename = `${newAssetId}.${type.ext}`;
      const { error: upErr } = await supabase()
        .storage.from(BUCKET)
        .upload(newFilename, bytes, {
          contentType: type.mime,
          upsert: false,
        });
      if (upErr) throw new Error(upErr.message);
      const { error: assetErr } = await supabase().from("assets").insert({
        id: newAssetId,
        group_id: null,
        entry_id: null, // linked below, once the entry exists
        kind: "article",
        filename: newFilename,
        mime: type.mime,
        bytes: bytes.length,
        title: post.title.slice(0, 200),
        alt: (post.image.alt || post.title).slice(0, 500),
        caption: "",
        sort_order: 0,
      });
      if (assetErr) throw new Error(assetErr.message);
      coverId = newAssetId;
    }

    const row = {
      kind: "article",
      title: post.title,
      subtitle: "",
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

    // The new cover belongs to this article.
    if (newAssetId) {
      const { error } = await supabase()
        .from("assets")
        .update({ entry_id: entryId })
        .eq("id", newAssetId);
      if (error) throw new Error(error.message);
    }

    // Drop the cover the article no longer uses.
    const oldCover = existing?.cover_id ?? "";
    if (oldCover && oldCover !== coverId) await removeAsset(oldCover);

    return { id: entryId, url: siteUrl(articlePath({ slug: post.slug, id: entryId })) };
  } catch (e) {
    // Leave nothing behind if the article couldn't be saved.
    if (newAssetId) await removeAsset(newAssetId);
    else if (newFilename) await storageDelete(newFilename);
    throw e;
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

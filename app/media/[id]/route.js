import { supabase, BUCKET } from "../../../lib/supabase.mjs";
import { getSettings } from "../../../lib/db.mjs";
import { authenticated } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });

/**
 * Streams a file from the private Supabase Storage bucket.
 * The bucket is never exposed directly: a file is served only if it belongs
 * to a published collection, is the current portrait/CV, or the visitor is
 * the signed-in admin. Unpublishing therefore stops access immediately
 * (apart from a short browser cache of public files).
 */
export async function GET(request, { params }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();

  const { data: a, error } = await supabase()
    .from("assets")
    .select("filename, mime, kind, group_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !a) return notFound();

  let publicFile;
  if (a.group_id) {
    const { data: grp } = await supabase()
      .from("groups")
      .select("id")
      .eq("id", a.group_id)
      .eq("published", true)
      .maybeSingle();
    publicFile = !!grp;
  } else {
    const s = await getSettings();
    publicFile = [s.cvId, s.portraitId].includes(id);
  }

  if (!publicFile && !(await authenticated())) return notFound();

  const { data: blob, error: dlErr } = await supabase()
    .storage.from(BUCKET)
    .download(a.filename);
  if (dlErr || !blob) {
    console.error("[media] download failed", a.filename, dlErr?.message);
    return notFound();
  }

  const headers = {
    "Content-Type": a.mime,
    "Content-Length": String(blob.size),
    "X-Content-Type-Options": "nosniff",
    // Public files may sit in the visitor's own browser cache briefly;
    // drafts seen by the admin are never cached.
    "Cache-Control": publicFile ? "private, max-age=300" : "private, no-store",
  };
  if (a.kind === "cv")
    headers["Content-Disposition"] = 'attachment; filename="Esaint-Mjay-CV.pdf"';

  return new Response(blob.stream(), { headers });
}

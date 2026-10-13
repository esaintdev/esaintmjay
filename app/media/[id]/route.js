import { supabase, BUCKET } from "../../../lib/supabase.mjs";
import { getSettings } from "../../../lib/db.mjs";
import { authenticated } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;

  // fetch asset metadata
  const { data: a, error } = await supabase()
    .from("assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !a) return new Response("Not found", { status: 404 });

  // determine if the file is accessible publicly
  const s = await getSettings();
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
    publicFile = [s.cvId, s.portraitId].includes(id);
  }

  if (!publicFile && !(await authenticated()))
    return new Response("Not found", { status: 404 });

  // For a public bucket: get the direct CDN URL and redirect
  const { data: urlData } = supabase()
    .storage
    .from(BUCKET)
    .getPublicUrl(a.filename);

  if (!urlData?.publicUrl)
    return new Response("File unavailable", { status: 404 });

  // CV: force download via Content-Disposition — must proxy
  if (a.kind === "cv") {
    try {
      const { data: blob, error: dlErr } = await supabase()
        .storage
        .from(BUCKET)
        .download(a.filename);
      if (dlErr || !blob)
        return new Response("File unavailable", { status: 404 });
      const arrayBuffer = await blob.arrayBuffer();
      return new Response(arrayBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(arrayBuffer.byteLength),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": 'attachment; filename="Esaint-Mjay-CV.pdf"',
        },
      });
    } catch {
      return new Response("File unavailable", { status: 404 });
    }
  }

  // Images: redirect to the CDN URL directly (fast, cacheable)
  return Response.redirect(urlData.publicUrl, 302);
}

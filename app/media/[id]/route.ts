import { supabase } from "../../../lib/supabase.ts";
import { getSettings, storageSignedUrl } from "../../../lib/db.ts";
import { authenticated } from "../../../lib/auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });

// How long a signed link stays valid, and how long the browser may reuse
// the redirect to it (shorter, so a cached redirect never points at an
// expired link).
const LINK_SECONDS = 600;
const REUSE_SECONDS = 300;

/**
 * Sends the visitor to a short-lived signed link for a file in the private
 * Supabase Storage bucket. The bucket is never exposed directly: a link is
 * issued only if the file belongs to a published collection, is the current
 * portrait/CV, or the visitor is the signed-in admin. Unpublishing stops new
 * links at once; links already issued expire within LINK_SECONDS.
 *
 * Redirecting (rather than streaming the file through this function) keeps
 * large images off Vercel function bandwidth and size limits.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();

  const { data: a, error } = await supabase()
    .from("assets")
    .select("filename, kind, group_id")
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

  const url = await storageSignedUrl(
    a.filename,
    LINK_SECONDS,
    a.kind === "cv" ? "Esaint-Mjay-CV.pdf" : undefined,
  );
  if (!url) return notFound();

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // drafts seen by the admin are never cached
      "Cache-Control": publicFile
        ? `private, max-age=${REUSE_SECONDS}`
        : "private, no-store",
    },
  });
}

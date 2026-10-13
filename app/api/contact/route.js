import { randomUUID } from "node:crypto";
import { supabase } from "../../../lib/supabase.mjs";
import {
  checkOrigin,
  clientKey,
  rateLimit,
  jsonBody,
  text,
  email,
} from "../../../lib/security.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(r) {
  try {
    checkOrigin(r);
    await rateLimit(`contact:${clientKey(r)}`, 5, 15 * 60_000);

    const v = await jsonBody(r);
    // Honeypot
    if (v.website) return Response.json({ ok: true });

    const { error } = await supabase()
      .from("messages")
      .insert({
        id: randomUUID(),
        name: text(v.name, 150, true),
        email: email(v.email),
        subject: text(v.subject, 200, true),
        message: text(v.message, 6000, true),
        created_at: new Date().toISOString(),
      });

    if (error) throw new Error(error.message);

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      {
        error: e.status
          ? e.message
          : "Your message could not be saved. Please try again.",
      },
      { status: e.status || 500 },
    );
  }
}

import { cookies } from "next/headers";
import { supabase } from "../../../lib/supabase.mjs";
import {
  COOKIE,
  checkOrigin,
  clientKey,
  rateLimit,
  jsonBody,
  verifyPassword,
  createSession,
  hashToken,
  email,
  HttpError,
} from "../../../lib/security.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    checkOrigin(request);
    await rateLimit(`login:${clientKey(request)}`, 10, 15 * 60_000);

    const v = await jsonBody(request);

    const { data: a, error } = await supabase()
      .from("admin")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (error) throw new HttpError("Database error.", 503);
    if (!a)
      throw new HttpError(
        "Run npm run admin:setup on the server to create your account.",
        503,
      );

    const matches = await verifyPassword(v.password, a.password);
    if (email(v.email) !== a.email || !matches)
      throw new HttpError("Email or password is incorrect.", 401);

    const token = await createSession();
    (await cookies()).set(COOKIE, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: (process.env.APP_ORIGIN || "").startsWith("https://"),
      path: "/",
      maxAge: 8 * 3600,
    });

    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { error: e.status ? e.message : "Unable to sign in." },
      { status: e.status || 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    checkOrigin(request);
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (token) {
      await supabase()
        .from("sessions")
        .delete()
        .eq("token", hashToken(token));
    }
    jar.delete(COOKIE);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}

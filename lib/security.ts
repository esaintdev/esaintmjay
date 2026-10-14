/**
 * lib/security.ts
 * ---------------------------------------------------------
 * Auth, session management, rate limiting and input validation.
 */
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { supabase } from "./supabase.ts";

export const COOKIE = "esaint_session";
const SESSION_MS = 8 * 3600_000;

const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

export const hashToken = (t: string): string =>
  createHash("sha256").update(t).digest("hex");

// ─── HttpError ────────────────────────────────────────────────────────────────
/** An error whose message is safe to show to the user. */
export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** User-facing message and status for any thrown value. */
export function errorResponse(e: unknown, fallback: string): Response {
  if (e instanceof HttpError)
    return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: fallback }, { status: 500 });
}

// ─── password ─────────────────────────────────────────────────────────────────
export async function passwordHash(p: unknown): Promise<string> {
  if (typeof p !== "string" || p.length < 12 || p.length > 256)
    throw new HttpError("Use a password between 12 and 256 characters.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(p, salt)).toString("hex")}`;
}

export async function verifyPassword(
  p: unknown,
  hash: string,
): Promise<boolean> {
  if (typeof p !== "string" || p.length > 256) return false;
  const [salt, value] = hash.split(":");
  if (!salt || !value) return false;
  const a = await derive(p, salt);
  const b = Buffer.from(value, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── sessions ─────────────────────────────────────────────────────────────────
export async function createSession(): Promise<string> {
  const t = randomBytes(32).toString("hex");

  // prune expired sessions
  await supabase().from("sessions").delete().lt("expires", Date.now());

  const { error } = await supabase()
    .from("sessions")
    .insert({ token: hashToken(t), expires: Date.now() + SESSION_MS });

  if (error) {
    console.error("[security] createSession", error);
    throw new HttpError("Could not create session.", 500);
  }
  return t;
}

export async function validSession(t: unknown): Promise<boolean> {
  if (typeof t !== "string" || !/^[a-f0-9]{64}$/.test(t)) return false;
  const { data, error } = await supabase()
    .from("sessions")
    .select("token")
    .eq("token", hashToken(t))
    .gt("expires", Date.now())
    .maybeSingle();
  if (error) {
    console.error("[security] validSession", error);
    return false;
  }
  return !!data;
}

// ─── rate limiting ────────────────────────────────────────────────────────────
/**
 * Counts an attempt for `key` and throws 429 once `max` attempts have been
 * made within `period` ms. The increment is atomic in Postgres
 * (rate_limit_increment in scripts/migrate.sql). Fails closed: if the
 * counter cannot be updated, the request is refused rather than unlimited.
 */
export async function rateLimit(
  key: string,
  max: number,
  period: number,
): Promise<void> {
  const { data, error } = await supabase().rpc("rate_limit_increment", {
    p_key: key,
    p_period: period,
  });

  if (error || typeof data !== "number") {
    console.error(
      "[security] rateLimit failed — has `npm run migrate` been run?",
      error?.message,
    );
    throw new HttpError("This service is temporarily unavailable.", 503);
  }

  if (data > max)
    throw new HttpError("Too many attempts. Please try again later.", 429);
}

// ─── origin check ─────────────────────────────────────────────────────────────
export const clientKey = (r: Request): string =>
  process.env.TRUST_PROXY === "true"
    ? (r.headers.get("x-forwarded-for") || "shared")
        .split(",")[0]
        .trim()
        .slice(0, 100)
    : "shared";

export function checkOrigin(r: Request): void {
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
    throw new HttpError("APP_ORIGIN must be configured on the server.", 503);
  if (
    r.headers.get("origin") !== new URL(process.env.APP_ORIGIN || r.url).origin
  )
    throw new HttpError("This request did not come from this website.", 403);
}

// ─── body parsing ─────────────────────────────────────────────────────────────
export async function readBody(r: Request, limit = 100_000): Promise<Buffer> {
  if (Number(r.headers.get("content-length")) > limit)
    throw new HttpError("The upload is too large.", 413);
  const reader = r.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError("The upload is too large.", 413);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

/** A JSON object body. Field values are unchecked: validate each one. */
export type Body = Record<string, unknown>;

export async function jsonBody(r: Request, limit?: number): Promise<Body> {
  let v: unknown;
  try {
    v = JSON.parse((await readBody(r, limit)).toString());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("Invalid request data.");
  }
  if (typeof v !== "object" || v === null || Array.isArray(v))
    throw new HttpError("Invalid request data.");
  return v as Body;
}

// ─── field validators ─────────────────────────────────────────────────────────
export function text(v: unknown, max = 500, required = false): string {
  if (typeof v !== "string") {
    if (required) throw new HttpError("A required field is missing.");
    return "";
  }
  const s = v.trim();
  if (s.length > max)
    throw new HttpError(`Please keep this field under ${max} characters.`);
  if (required && !s)
    throw new HttpError("Please fill in the required fields.");
  return s;
}

export function email(v: unknown): string {
  const s = text(v, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    throw new HttpError("Please enter a valid email address.");
  return s;
}

export function safeUrl(v: unknown): string {
  const s = text(v, 1000);
  if (!s) return "";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError("Use a full URL starting with https://.");
  }
  if (!["https:", "http:"].includes(u.protocol))
    throw new HttpError("Use a web URL starting with https://.");
  return u.href;
}

// ─── file type detection ─────────────────────────────────────────────────────
export type FileType = { mime: string; ext: string };

/** Detects a supported file type from its first bytes (signature). */
export function fileType(b: Buffer): FileType | null {
  if (b.length < 16) return null;
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return { mime: "image/png", ext: "png" };
  if (b[0] === 255 && b[1] === 216 && b[2] === 255)
    return { mime: "image/jpeg", ext: "jpg" };
  if (["GIF87a", "GIF89a"].includes(b.toString("ascii", 0, 6)))
    return { mime: "image/gif", ext: "gif" };
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return { mime: "image/webp", ext: "webp" };
  if (b.toString("ascii", 0, 5) === "%PDF-")
    return { mime: "application/pdf", ext: "pdf" };
  return null;
}

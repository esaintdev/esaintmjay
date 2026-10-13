/**
 * lib/security.mjs
 * ---------------------------------------------------------
 * Auth, session management, and rate-limiting backed by Supabase.
 */
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { supabase } from "./supabase.mjs";

const derive = promisify(scrypt);

export const COOKIE = "esaint_session";

export const hashToken = (t) =>
  createHash("sha256").update(t).digest("hex");

// ─── HttpError ────────────────────────────────────────────────────────────────
export class HttpError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ─── password ─────────────────────────────────────────────────────────────────
export async function passwordHash(p) {
  if (typeof p !== "string" || p.length < 12 || p.length > 256)
    throw new HttpError("Use a password between 12 and 256 characters.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(p, salt, 64)).toString("hex")}`;
}

export async function verifyPassword(p, h) {
  if (typeof p !== "string" || p.length > 256) return false;
  const [salt, value] = h.split(":");
  const a = await derive(p, salt, 64);
  const b = Buffer.from(value, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── sessions ─────────────────────────────────────────────────────────────────
export async function createSession() {
  const t = randomBytes(32).toString("hex");
  const expires = Date.now() + 8 * 3600_000;

  // prune expired sessions
  await supabase()
    .from("sessions")
    .delete()
    .lt("expires", Date.now());

  const { error } = await supabase()
    .from("sessions")
    .insert({ token: hashToken(t), expires });

  if (error) {
    console.error("[security] createSession", error);
    throw new HttpError("Could not create session.", 500);
  }
  return t;
}

export async function validSession(t) {
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
export async function rateLimit(key, max, period) {
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
export const clientKey = (r) =>
  process.env.TRUST_PROXY === "true"
    ? (r.headers.get("x-forwarded-for") || "shared")
        .split(",")[0]
        .trim()
        .slice(0, 100)
    : "shared";

export function checkOrigin(r) {
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
    throw new HttpError("APP_ORIGIN must be configured on the server.", 503);
  if (
    r.headers.get("origin") !==
    new URL(process.env.APP_ORIGIN || r.url).origin
  )
    throw new HttpError("This request did not come from this website.", 403);
}

// ─── body parsing ─────────────────────────────────────────────────────────────
export async function readBody(r, limit = 100_000) {
  if (Number(r.headers.get("content-length")) > limit)
    throw new HttpError("The upload is too large.", 413);
  const reader = r.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let size = 0;
  const parts = [];
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

export async function jsonBody(r) {
  try {
    return JSON.parse((await readBody(r)).toString());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("Invalid request data.");
  }
}

// ─── field validators ─────────────────────────────────────────────────────────
export function text(v, max = 500, required = false) {
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

export function email(v) {
  const s = text(v, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    throw new HttpError("Please enter a valid email address.");
  return s;
}

export function safeUrl(v) {
  const s = text(v, 1000);
  if (!s) return "";
  let u;
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
export function fileType(b) {
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

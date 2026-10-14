/**
 * lib/client.ts
 * ---------------------------------------------------------
 * Small helpers for client components.
 */
import type { AssetKind } from "./types.ts";

/** A readable message for anything caught in a try/catch. */
export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

/** Calls the admin API; sends the browser to sign-in when the session ends. */
export async function apiCall<T extends object = { ok?: boolean; id?: string }>(
  url: string,
  method: "POST" | "PUT" | "DELETE" = "POST",
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) location.assign("/admin/login");
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || "Please try again.");
  return d;
}

const maxBytes: Record<AssetKind, number> = {
  work: 15 * 1024 * 1024,
  portrait: 15 * 1024 * 1024,
  article: 15 * 1024 * 1024,
  cv: 10 * 1024 * 1024,
};

/**
 * Uploads one file straight to Supabase Storage and registers it:
 * 1. ask the server for a one-time upload link,
 * 2. PUT the file to Supabase,
 * 3. let the server check the file and save it.
 * Returns the new asset id (used as /media/<id>).
 */
export async function uploadFile(
  file: File,
  kind: AssetKind,
  link: { groupId?: string; entryId?: string } = {},
): Promise<string> {
  if (file.size > maxBytes[kind]) throw new Error("File too large.");
  const ticket = await apiCall<{
    id: string;
    filename: string;
    uploadUrl: string;
  }>("/api/admin/upload", "POST", {
    kind,
    ...link,
    name: file.name,
    type: file.type,
    size: file.size,
  });
  const put = await fetch(ticket.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error("The upload failed. Please try again.");
  await apiCall("/api/admin/upload/complete", "POST", {
    id: ticket.id,
    filename: ticket.filename,
    kind,
    ...link,
    name: file.name,
  });
  return ticket.id;
}

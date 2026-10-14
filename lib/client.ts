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
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (r.status === 401) location.assign("/admin/login");
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || "Please try again.");
  return d;
}

const maxBytes: Record<AssetKind, number> = {
  work: 15 * 1024 * 1024,
  portrait: 15 * 1024 * 1024,
  article: 15 * 1024 * 1024,
  cv: 10 * 1024 * 1024,
};

export type UploadPhase = "preparing" | "uploading" | "checking";
export type UploadProgress = {
  phase: UploadPhase;
  loaded: number;
  total: number;
};

/** Error thrown when an upload is cancelled by the user. */
export class UploadCancelled extends Error {
  constructor() {
    super("Cancelled.");
  }
}

/** Fails an upload that has sent nothing for this long. */
const STALL_MS = 45_000;

/**
 * PUTs a file to a signed Supabase upload URL, reporting progress.
 * (fetch() cannot report upload progress; XMLHttpRequest can.)
 */
function putFile(
  url: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let last = Date.now();
    let stalled = false;
    const watchdog = setInterval(() => {
      if (Date.now() - last > STALL_MS) {
        stalled = true;
        xhr.abort();
      }
    }, 5000);
    const done = () => {
      clearInterval(watchdog);
      signal?.removeEventListener("abort", cancel);
    };
    const cancel = () => xhr.abort();

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      last = Date.now();
      onProgress(e.loaded, e.lengthComputable ? e.total : file.size);
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Storage refused the file (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as {
          message?: string;
          error?: string;
        };
        message = body.message || body.error || message;
      } catch {
        // keep the status message
      }
      reject(new Error(message));
    };
    xhr.onerror = () => {
      done();
      reject(new Error("Network error. Check your connection and try again."));
    };
    xhr.onabort = () => {
      done();
      reject(
        stalled
          ? new Error(
              "The upload stalled (no data sent for 45 seconds). Please try again.",
            )
          : new UploadCancelled(),
      );
    };
    if (signal?.aborted) return cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    xhr.send(file);
  });
}

/**
 * Uploads one file straight to Supabase Storage and registers it:
 * 1. ask the server for a one-time upload link,
 * 2. PUT the file to Supabase (with progress),
 * 3. let the server check the file and save it.
 * Returns the new asset id (used as /media/<id>).
 */
export async function uploadFile(
  file: File,
  kind: AssetKind,
  link: { groupId?: string; entryId?: string } = {},
  onProgress: (p: UploadProgress) => void = () => {},
  signal?: AbortSignal,
): Promise<string> {
  if (file.size > maxBytes[kind])
    throw new Error(`Too large (max ${maxBytes[kind] / 1048576} MB).`);
  const total = file.size;
  onProgress({ phase: "preparing", loaded: 0, total });
  const ticket = await apiCall<{
    id: string;
    filename: string;
    uploadUrl: string;
  }>(
    "/api/admin/upload",
    "POST",
    { kind, ...link, name: file.name, type: file.type, size: file.size },
    signal,
  );
  await putFile(
    ticket.uploadUrl,
    file,
    (loaded) => onProgress({ phase: "uploading", loaded, total }),
    signal,
  );
  onProgress({ phase: "checking", loaded: total, total });
  // the server check normally takes a second or two; never wait forever
  const timeout = AbortSignal.timeout(90_000);
  try {
    await apiCall(
      "/api/admin/upload/complete",
      "POST",
      {
        id: ticket.id,
        filename: ticket.filename,
        kind,
        ...link,
        name: file.name,
      },
      signal ? AbortSignal.any([signal, timeout]) : timeout,
    );
  } catch (e) {
    if (signal?.aborted) throw new UploadCancelled();
    if (timeout.aborted)
      throw new Error(
        "Uploaded, but the server took too long to confirm it. Please try again.",
      );
    throw e;
  }
  return ticket.id;
}

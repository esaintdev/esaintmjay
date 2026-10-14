"use client";
import { useCallback, useRef, useState } from "react";
import type { AssetKind } from "../lib/types.ts";
import {
  errorMessage,
  uploadFile,
  UploadCancelled,
  type UploadPhase,
} from "../lib/client.ts";

type Status = "waiting" | UploadPhase | "done" | "failed" | "cancelled";

export type UploadItem = {
  key: string;
  name: string;
  size: number;
  status: Status;
  loaded: number;
  error?: string;
};

type Link = { groupId?: string; entryId?: string };
type Job = {
  file: File;
  kind: AssetKind;
  link: Link;
  controller: AbortController;
};

const PARALLEL = 3;
let counter = 0;

/**
 * Upload queue with per-file progress, cancel and retry. `run` uploads the
 * files (a few at a time) and resolves with the ids of those that succeeded,
 * in the order given.
 */
export function useUploadQueue() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const jobs = useRef(new Map<string, Job>());

  const update = useCallback((key: string, patch: Partial<UploadItem>) => {
    setItems((list) =>
      list.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );
  }, []);

  const runOne = useCallback(
    async (key: string): Promise<string | null> => {
      const job = jobs.current.get(key);
      if (!job) return null;
      try {
        const id = await uploadFile(
          job.file,
          job.kind,
          job.link,
          (p) => update(key, { status: p.phase, loaded: p.loaded }),
          job.controller.signal,
        );
        update(key, {
          status: "done",
          loaded: job.file.size,
          error: undefined,
        });
        return id;
      } catch (e) {
        const cancelled =
          e instanceof UploadCancelled || job.controller.signal.aborted;
        update(key, {
          status: cancelled ? "cancelled" : "failed",
          error: cancelled ? undefined : errorMessage(e),
        });
        return null;
      }
    },
    [update],
  );

  const run = useCallback(
    async (
      files: File[],
      kind: AssetKind,
      link: Link = {},
    ): Promise<string[]> => {
      const keys = files.map((file) => {
        const key = `u${++counter}`;
        jobs.current.set(key, {
          file,
          kind,
          link,
          controller: new AbortController(),
        });
        return key;
      });
      setItems((list) => [
        ...list.filter((i) => !["done", "cancelled"].includes(i.status)),
        ...files.map((f, n) => ({
          key: keys[n] ?? "",
          name: f.name,
          size: f.size,
          status: "waiting" as const,
          loaded: 0,
        })),
      ]);
      const ids: (string | null)[] = new Array(keys.length).fill(null);
      let next = 0;
      const worker = async () => {
        while (next < keys.length) {
          const n = next++;
          ids[n] = await runOne(keys[n] ?? "");
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(PARALLEL, keys.length) }, worker),
      );
      return ids.filter((id): id is string => id !== null);
    },
    [runOne],
  );

  /** Uploads a failed file again; resolves with its id if it succeeds. */
  const retry = useCallback(
    async (key: string): Promise<string | null> => {
      const job = jobs.current.get(key);
      if (!job) return null;
      jobs.current.set(key, { ...job, controller: new AbortController() });
      update(key, { status: "waiting", loaded: 0, error: undefined });
      return runOne(key);
    },
    [runOne, update],
  );

  const cancel = useCallback((key: string) => {
    jobs.current.get(key)?.controller.abort();
  }, []);

  const dismiss = useCallback((key: string) => {
    jobs.current.delete(key);
    setItems((list) => list.filter((i) => i.key !== key));
  }, []);

  const active = items.some((i) =>
    ["waiting", "preparing", "uploading", "checking"].includes(i.status),
  );
  return { items, run, retry, cancel, dismiss, active };
}

const mb = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;

function label(i: UploadItem): string {
  switch (i.status) {
    case "waiting":
      return "Waiting…";
    case "preparing":
      return "Preparing…";
    case "uploading":
      return `Uploading ${Math.floor((i.loaded / Math.max(i.size, 1)) * 100)}% · ${mb(i.loaded)} of ${mb(i.size)}`;
    case "checking":
      return "Checking the file…";
    case "done":
      return "Uploaded ✓";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return i.error || "Failed";
  }
}

/** The list of uploads with progress bars. Renders nothing when empty. */
export function UploadList({
  queue,
  onRetried,
}: {
  queue: ReturnType<typeof useUploadQueue>;
  /** Called with the asset id after a successful retry. */
  onRetried?: (id: string) => void;
}) {
  if (!queue.items.length) return null;
  const finished = queue.items.filter((i) => i.status === "done").length;
  return (
    <div className="upload-list" aria-live="polite">
      {queue.items.length > 1 && (
        <p className="upload-summary">
          {finished} of {queue.items.length} uploaded
        </p>
      )}
      {queue.items.map((i) => {
        const pct =
          i.status === "done" || i.status === "checking"
            ? 100
            : i.status === "uploading"
              ? (i.loaded / Math.max(i.size, 1)) * 100
              : 0;
        const working = [
          "waiting",
          "preparing",
          "uploading",
          "checking",
        ].includes(i.status);
        return (
          <div className={`upload-item is-${i.status}`} key={i.key}>
            <div className="upload-row">
              <span className="upload-name" title={i.name}>
                {i.name}
              </span>
              <span className="upload-size">{mb(i.size)}</span>
            </div>
            <div
              className="upload-bar"
              role="progressbar"
              aria-label={`Upload progress for ${i.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="upload-row">
              <span
                className="upload-status"
                role={i.status === "failed" ? "alert" : undefined}
              >
                {label(i)}
              </span>
              <span className="upload-actions">
                {working && i.status !== "checking" && (
                  <button type="button" onClick={() => queue.cancel(i.key)}>
                    Cancel
                  </button>
                )}
                {i.status === "failed" && (
                  <button
                    type="button"
                    onClick={async () => {
                      const id = await queue.retry(i.key);
                      if (id) onRetried?.(id);
                    }}
                  >
                    Retry
                  </button>
                )}
                {!working && (
                  <button
                    type="button"
                    aria-label={`Dismiss ${i.name}`}
                    onClick={() => queue.dismiss(i.key)}
                  >
                    ×
                  </button>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

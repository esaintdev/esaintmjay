/**
 * lib/seo.ts
 * ---------------------------------------------------------
 * Helpers for page metadata, structured data and the sitemap.
 * No server imports, so any component can use them.
 */
import type { Entry } from "./types.ts";

/** The public address of an article. */
export const articlePath = (a: Pick<Entry, "slug" | "id">): string =>
  `/journal/${a.slug || a.id}`;

/** The site's public address (APP_ORIGIN), used for absolute URLs. */
export const origin = (): string =>
  (process.env.APP_ORIGIN || "http://localhost:3000").replace(/\/$/, "");

/** An absolute URL for a site path. */
export const siteUrl = (path: string): string => `${origin()}${path}`;

/** A search-result length description (about 160 characters). */
export function describe(text: string, max = 160): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

/** e.g. "14 October 2026" */
export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(iso));

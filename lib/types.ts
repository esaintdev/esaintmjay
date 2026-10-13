/**
 * lib/types.ts
 * ---------------------------------------------------------
 * Domain types shared by the server, the public site and the admin UI.
 * Has no server imports, so client components can use it too.
 */
import type { Row } from "./database.types.ts";

export type SocialLink = { label: string; url: string };

export type Settings = {
  name: string;
  role: string;
  heroTitle: string;
  heroDescription: string;
  availability: string;
  specialties: string;
  aboutLabel: string;
  aboutTitle: string;
  aboutIntro: string;
  aboutBody: string;
  location: string;
  experience: string;
  email: string;
  phone: string;
  workTitle: string;
  workDescription: string;
  servicesTitle: string;
  contactTitle: string;
  contactDescription: string;
  footerNote: string;
  accent: string;
  portraitId: string;
  cvId: string;
  socialLinks: SocialLink[];
  seoTitle: string;
  seoDescription: string;
  showServices: boolean;
  showAwards: boolean;
  showExperience: boolean;
  showArticles: boolean;
};

type KeysOfType<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];
export type TextSettingKey = KeysOfType<Settings, string>;
export type BooleanSettingKey = KeysOfType<Settings, boolean>;

export const entryKinds = [
  "service",
  "experience",
  "award",
  "article",
] as const;
export type EntryKind = (typeof entryKinds)[number];
export const isEntryKind = (v: unknown): v is EntryKind =>
  typeof v === "string" && (entryKinds as readonly string[]).includes(v);

export type AssetKind = "work" | "portrait" | "cv";

export type Group = Row<"groups">;
export type Asset = Row<"assets">;
export type Entry = Row<"entries">;
export type Message = Row<"messages">;

/** A collection with its image count and cover image (or first image). */
export type GroupSummary = Group & { image_count: number; image_id: string };

/** Everything the admin UI loads from GET /api/admin. */
export type AdminData = {
  settings: Settings;
  groups: GroupSummary[];
  assets: Asset[];
  entries: Entry[];
  messages: Message[];
  adminEmail: string;
};

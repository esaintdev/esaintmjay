/**
 * lib/richtext.ts
 * ---------------------------------------------------------
 * Article body format: a Tiptap/ProseMirror JSON document, stored in
 * entries.content. Nothing is ever rendered as raw HTML. Instead:
 *
 *  - sanitizeDoc() rebuilds any incoming document keeping only the node
 *    types, marks and attributes listed below. Links must be http(s),
 *    mailto or site-relative; images must be this site's /media/<id>.
 *  - components/RichText.tsx renders only those same types as React
 *    elements.
 *
 * No server imports: the admin editor uses these helpers too.
 */

export type RichMark =
  | { type: "bold" | "italic" | "underline" | "strike" | "code" }
  | { type: "link"; attrs: { href: string } };

export type RichNode = {
  type: string;
  attrs?: Record<string, string | number>;
  content?: RichNode[];
  text?: string;
  marks?: RichMark[];
};

export type RichDoc = { type: "doc"; content: RichNode[] };

/** Block nodes that hold other nodes. */
const containers = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
]);
/** Nodes with no content. */
const leaves = new Set(["hardBreak", "horizontalRule", "image"]);
const simpleMarks = new Set(["bold", "italic", "underline", "strike", "code"]);

export const headingLevels = [2, 3, 4] as const;
const MAX_DEPTH = 12;
const MAX_NODES = 20_000;

const mediaSrc =
  /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const record = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** A link target that is safe to put in an href, or "" if it isn't. */
export function safeHref(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim().slice(0, 2000);
  if (!s) return "";
  if (s.startsWith("/") && !s.startsWith("//")) return s; // same-site path
  if (s.startsWith("#")) return s;
  try {
    const u = new URL(s);
    return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}

function cleanMarks(v: unknown): RichMark[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: RichMark[] = [];
  for (const m of v) {
    const type = record(m).type;
    if (typeof type !== "string") continue;
    if (simpleMarks.has(type))
      out.push({
        type: type as "bold" | "italic" | "underline" | "strike" | "code",
      });
    else if (type === "link") {
      const href = safeHref(record(record(m).attrs).href);
      if (href) out.push({ type: "link", attrs: { href } });
    }
  }
  return out.length ? out : undefined;
}

/**
 * Rebuilds a document from untrusted JSON, dropping anything unknown.
 * Returns null if nothing usable remains.
 */
export function sanitizeDoc(input: unknown): RichDoc | null {
  let count = 0;

  function node(v: unknown, depth: number): RichNode | null {
    if (++count > MAX_NODES || depth > MAX_DEPTH) return null;
    const n = record(v);
    const type = n.type;
    if (typeof type !== "string") return null;

    if (type === "text") {
      if (typeof n.text !== "string" || !n.text) return null;
      const marks = cleanMarks(n.marks);
      return marks ? { type, text: n.text, marks } : { type, text: n.text };
    }

    const attrs = record(n.attrs);
    if (type === "image") {
      const src = typeof attrs.src === "string" ? attrs.src : "";
      if (!mediaSrc.test(src)) return null;
      const alt = typeof attrs.alt === "string" ? attrs.alt.slice(0, 500) : "";
      const title =
        typeof attrs.title === "string" ? attrs.title.slice(0, 500) : "";
      return { type, attrs: title ? { src, alt, title } : { src, alt } };
    }
    if (leaves.has(type)) return { type };
    if (!containers.has(type)) return null;

    const content = Array.isArray(n.content)
      ? n.content
          .map((c) => node(c, depth + 1))
          .filter((c): c is RichNode => c !== null)
      : [];
    const out: RichNode = { type };
    if (content.length) out.content = content;

    if (type === "heading") {
      const level = Number(attrs.level);
      out.attrs = {
        level: (headingLevels as readonly number[]).includes(level) ? level : 2,
      };
    } else if (type === "orderedList") {
      const start = Number(attrs.start);
      if (Number.isSafeInteger(start) && start > 1 && start < 100_000)
        out.attrs = { start };
    }
    return out;
  }

  const root = record(input);
  if (root.type !== "doc" || !Array.isArray(root.content)) return null;
  const content = root.content
    .map((c) => node(c, 1))
    .filter((c): c is RichNode => c !== null);
  return content.length ? { type: "doc", content } : null;
}

/** Plain text of a document, with blank lines between blocks. */
export function plainText(doc: RichDoc | null): string {
  if (!doc) return "";
  const blocks: string[] = [];
  const inline = (n: RichNode): string =>
    n.type === "text"
      ? (n.text ?? "")
      : n.type === "hardBreak"
        ? "\n"
        : (n.content ?? []).map(inline).join("");
  const walk = (n: RichNode) => {
    if (["paragraph", "heading", "codeBlock"].includes(n.type)) {
      const t = inline(n).trim();
      if (t) blocks.push(t);
    } else if (n.type === "image") {
      // images contribute no text
    } else (n.content ?? []).forEach(walk);
  };
  doc.content.forEach(walk);
  return blocks.join("\n\n");
}

/** Asset ids of the images used in a document. */
export function imageIds(doc: RichDoc | null): string[] {
  const ids: string[] = [];
  const walk = (n: RichNode) => {
    if (n.type === "image" && typeof n.attrs?.src === "string")
      ids.push(n.attrs.src.slice("/media/".length));
    (n.content ?? []).forEach(walk);
  };
  doc?.content.forEach(walk);
  return [...new Set(ids)];
}

/** Converts a plain-text body (blank lines = paragraphs) to a document. */
export function docFromText(text: string): RichDoc {
  const content = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({
      type: "paragraph",
      content: p
        .split("\n")
        .flatMap((line, i): RichNode[] =>
          i
            ? [{ type: "hardBreak" }, { type: "text", text: line }]
            : [{ type: "text", text: line }],
        )
        .filter((n) => n.type !== "text" || n.text),
    }));
  return { type: "doc", content };
}

/** Estimated minutes to read, at ~220 words a minute. */
export const readingMinutes = (text: string): number =>
  Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));

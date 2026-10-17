/**
 * lib/calmify-html.ts
 * ---------------------------------------------------------
 * STOPGAP — converts the sanitized HTML that Calmify delivers
 * (CalmifyPost.contentHtml) into this site's article document
 * (lib/richtext.ts), so a Calmify article renders with its headings,
 * links, lists and emphasis instead of arriving as plain text.
 *
 * Calmify plans to send a structured document alongside the HTML. When it
 * does, delete this file and switch lib/calmify.ts to that payload.
 *
 * The parser is small and forgiving on purpose: unknown tags are
 * descended into rather than dropped, and its output is always passed
 * through sanitizeDoc() by the caller. So anything outside the allowed
 * node/mark set is removed there regardless of what arrives here.
 *
 * No server imports, so it can be tested offline.
 */
import type { RichDoc, RichMark, RichNode } from "./richtext.ts";

// ─── a minimal tolerant HTML tree ─────────────────────────────────────────────
type Element = { tag: string; attrs: Record<string, string>; children: Child[] };
type Child = string | Element;

const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

/** Decodes the HTML entities that can appear in text and attribute values. */
function decode(s: string): string {
  return s.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (full, ent: string) => {
      if (ent[0] === "#") {
        const code =
          ent[1] === "x" || ent[1] === "X"
            ? parseInt(ent.slice(2), 16)
            : parseInt(ent.slice(1), 10);
        return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : full;
      }
      return namedEntities[ent.toLowerCase()] ?? full;
    },
  );
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

const MAX_DEPTH = 200;

/** Builds a tree from HTML, recovering from stray tags and unclosed elements. */
function parse(html: string): Element {
  const root: Element = { tag: "#root", attrs: {}, children: [] };
  const stack: Element[] = [root];
  const add = (child: Child) => stack[stack.length - 1].children.push(child);
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      add(html.slice(i));
      break;
    }
    if (lt > i) add(html.slice(i, lt));

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt)) {
      const end = html.indexOf(">", lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    const gt = html.indexOf(">", lt);
    if (gt === -1) {
      add("<");
      i = lt + 1;
      continue;
    }
    const raw = html.slice(lt + 1, gt);
    i = gt + 1;

    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === name) {
          stack.length = s;
          break;
        }
      }
      continue;
    }

    const selfClose = raw.endsWith("/");
    const body = selfClose ? raw.slice(0, -1) : raw;
    const name = /^([a-zA-Z0-9:-]+)/.exec(body);
    const tag = (name?.[1] ?? "").toLowerCase();
    if (!tag) continue;
    const el: Element = {
      tag,
      attrs: parseAttrs(body.slice(name ? name[0].length : 0)),
      children: [],
    };
    add(el);
    if (!selfClose && !voidTags.has(tag) && stack.length < MAX_DEPTH)
      stack.push(el);
  }
  return root;
}

// ─── HTML → article document ──────────────────────────────────────────────────
const blockTags = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

/** Tags whose contents are never article text (scripts, styles, page chrome). */
const skipTags = new Set([
  "canvas",
  "embed",
  "head",
  "iframe",
  "noscript",
  "object",
  "script",
  "style",
  "svg",
  "template",
  "title",
]);

const markTags: Record<string, RichMark> = {
  strong: { type: "bold" },
  b: { type: "bold" },
  em: { type: "italic" },
  i: { type: "italic" },
  u: { type: "underline" },
  s: { type: "strike" },
  strike: { type: "strike" },
  del: { type: "strike" },
  code: { type: "code" },
};

/** Raw text of an element, whitespace preserved (for code blocks). */
function rawText(el: Element): string {
  let out = "";
  for (const c of el.children)
    out += typeof c === "string" ? decode(c) : rawText(c);
  return out;
}

/** Plain inline text of an element, used for an image caption. */
function flatText(el: Element): string {
  return rawText(el).replace(/\s+/g, " ").trim();
}

function sameMarks(a?: RichMark[], b?: RichMark[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function mergeAdjacent(nodes: RichNode[]): RichNode[] {
  const out: RichNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.type === "text" &&
      n.type === "text" &&
      sameMarks(prev.marks, n.marks)
    ) {
      prev.text = (prev.text ?? "") + (n.text ?? "");
      continue;
    }
    out.push(n);
  }
  return out;
}

/** Trims and tidies a run of inline nodes, or null when there is nothing. */
function inline(nodes: RichNode[]): RichNode[] | null {
  const out = mergeAdjacent(nodes);
  const first = out[0];
  if (first?.type === "text") first.text = (first.text ?? "").replace(/^\s+/, "");
  const last = out[out.length - 1];
  if (last?.type === "text") last.text = (last.text ?? "").replace(/\s+$/, "");
  // Drop nodes emptied by the trim above, but keep interior spaces.
  const kept = out.filter((n) => n.type !== "text" || (n.text ?? "") !== "");
  return kept.length ? kept : null;
}

function textNodes(s: string, marks: RichMark[]): RichNode[] {
  const t = decode(s).replace(/\s+/g, " ");
  if (!t) return [];
  const node: RichNode = { type: "text", text: t };
  if (marks.length) node.marks = marks;
  return [node];
}

function inlineOf(el: Element, marks: RichMark[]): RichNode[] {
  const out: RichNode[] = [];
  for (const c of el.children) out.push(...inlineNodes(c, marks));
  return out;
}

function inlineNodes(child: Child, marks: RichMark[]): RichNode[] {
  if (typeof child === "string") return textNodes(child, marks);
  if (child.tag === "br") return [{ type: "hardBreak" }];
  if (child.tag === "img") return []; // dropped; Calmify in-text images aren't ours
  if (skipTags.has(child.tag)) return [];
  const mark =
    markTags[child.tag] ??
    (child.tag === "a" && child.attrs.href?.trim()
      ? ({ type: "link", attrs: { href: child.attrs.href.trim() } } as RichMark)
      : null);
  return inlineOf(child, mark ? [...marks, mark] : marks);
}

function imageNode(el: Element): RichNode | null {
  const src = (el.attrs.src ?? "").trim();
  if (!src.startsWith("/media/")) return null; // only this site's own images
  const alt = el.attrs.alt ?? "";
  const title = el.attrs.title ?? "";
  return { type: "image", attrs: title ? { src, alt, title } : { src, alt } };
}

/** Reads an element's children as a run of block nodes (see `blocks`). */
function blocks(children: Child[], depth: number): RichNode[] {
  if (depth > MAX_DEPTH) return [];
  const out: RichNode[] = [];
  let run: RichNode[] = [];
  const flush = () => {
    const nodes = inline(run);
    if (nodes) out.push({ type: "paragraph", content: nodes });
    run = [];
  };
  for (const child of children) {
    if (typeof child === "string") {
      run.push(...textNodes(child, []));
      continue;
    }
    if (skipTags.has(child.tag)) continue;
    if (child.tag === "br") {
      run.push({ type: "hardBreak" });
      continue;
    }
    if (child.tag === "img") {
      flush();
      const img = imageNode(child);
      if (img) out.push(img);
      continue;
    }
    if (blockTags.has(child.tag)) {
      flush();
      out.push(...block(child, depth + 1));
      continue;
    }
    run.push(...inlineNodes(child, []));
  }
  flush();
  return out;
}

function listItem(el: Element, depth: number): RichNode | null {
  const content = blocks(el.children, depth + 1);
  return content.length ? { type: "listItem", content } : null;
}

function list(el: Element, type: "bulletList" | "orderedList", depth: number): RichNode | null {
  const content = el.children
    .filter((c): c is Element => typeof c !== "string" && c.tag === "li")
    .map((li) => listItem(li, depth))
    .filter((n): n is RichNode => n !== null);
  if (!content.length) return null;
  const node: RichNode = { type, content };
  if (type === "orderedList") {
    const start = Number(el.attrs.start);
    if (Number.isSafeInteger(start) && start > 1 && start < 100000)
      node.attrs = { start };
  }
  return node;
}

function block(el: Element, depth: number): RichNode[] {
  if (depth > MAX_DEPTH) return [];
  const tag = el.tag;

  if (tag === "p") {
    const nodes = inline(inlineOf(el, []));
    return nodes ? [{ type: "paragraph", content: nodes }] : [];
  }

  const h = /^h([1-6])$/.exec(tag);
  if (h) {
    const nodes = inline(inlineOf(el, []));
    if (!nodes) return [];
    const level = Math.min(4, Math.max(2, Number(h[1])));
    return [{ type: "heading", attrs: { level }, content: nodes }];
  }

  if (tag === "ul") {
    const node = list(el, "bulletList", depth);
    return node ? [node] : [];
  }
  if (tag === "ol") {
    const node = list(el, "orderedList", depth);
    return node ? [node] : [];
  }
  if (tag === "li") {
    const node = listItem(el, depth);
    return node ? [node] : [];
  }

  if (tag === "blockquote") {
    const content = blocks(el.children, depth + 1);
    return content.length ? [{ type: "blockquote", content }] : [];
  }

  if (tag === "pre") {
    const text = rawText(el).replace(/^\n+|\n+$/g, "");
    return text
      ? [{ type: "codeBlock", content: [{ type: "text", text }] }]
      : [];
  }

  if (tag === "hr") return [{ type: "horizontalRule" }];

  if (tag === "img") {
    const img = imageNode(el);
    return img ? [img] : [];
  }

  if (tag === "figure") {
    const img = el.children.find(
      (c): c is Element => typeof c !== "string" && c.tag === "img",
    );
    const caption = el.children.find(
      (c): c is Element => typeof c !== "string" && c.tag === "figcaption",
    );
    const node = img ? imageNode(img) : null;
    if (node) {
      const title = caption ? flatText(caption) : "";
      if (title) node.attrs = { ...node.attrs, title };
      return [node];
    }
    return blocks(el.children, depth + 1);
  }

  // div, section, table cells and any unknown container: keep what's inside
  return blocks(el.children, depth + 1);
}

/** Converts Calmify's HTML into this site's article document, or null. */
export function htmlToRichDoc(html: string): RichDoc | null {
  if (typeof html !== "string" || !html.trim()) return null;
  const content = blocks(parse(html).children, 0);
  return content.length ? { type: "doc", content } : null;
}

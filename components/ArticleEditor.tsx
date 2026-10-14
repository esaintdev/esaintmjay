"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import type { Entry } from "../lib/types.ts";
import {
  docFromText,
  headingLevels,
  plainText,
  safeHref,
  sanitizeDoc,
  readingMinutes,
} from "../lib/richtext.ts";
import { describe } from "../lib/seo.ts";
import { useUploadQueue, UploadList } from "./UploadQueue";

type SaveResult = { id?: string; slug?: string } | undefined;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);

const altFromName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();

/**
 * Writing view for one article: rich text body with images, cover image,
 * publishing options and search/social settings.
 */
export default function ArticleEditor({
  entry,
  busy,
  onSave,
  notify,
}: {
  entry?: Entry;
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<SaveResult>;
  notify: (message: string) => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? ""),
    [subtitle, setSubtitle] = useState(entry?.subtitle ?? ""),
    [category, setCategory] = useState(entry?.extra ?? ""),
    [slug, setSlug] = useState(entry?.slug ?? ""),
    [seoTitle, setSeoTitle] = useState(entry?.seo_title ?? ""),
    [seoDescription, setSeoDescription] = useState(
      entry?.seo_description ?? "",
    ),
    [coverId, setCoverId] = useState(entry?.cover_id ?? ""),
    [published, setPublished] = useState(entry?.published ?? false),
    [text, setText] = useState(entry?.body ?? "");
  const imageInput = useRef<HTMLInputElement>(null),
    coverInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [...headingLevels] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
        },
      }),
      ImageExtension.configure({ allowBase64: false }),
    ],
    content: sanitizeDoc(entry?.content) ?? docFromText(entry?.body ?? ""),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "rich-editor-content prose",
        "aria-label": "Article text",
      },
    },
    onUpdate: ({ editor: e }) => setText(e.getText()),
  });

  const imageQueue = useUploadQueue(),
    coverQueue = useUploadQueue();
  const uploading = imageQueue.active || coverQueue.active;

  function insertImage(id: string, name = "") {
    editor
      ?.chain()
      .focus()
      .setImage({ src: `/media/${id}`, alt: altFromName(name) })
      .run();
  }

  async function addImages(files: File[]) {
    const ids = await imageQueue.run(files, "article", { entryId: entry?.id });
    // insert in the order chosen; failed files stay in the list to retry
    for (const id of ids) insertImage(id);
    if (ids.length < files.length)
      notify("Some images didn't upload. Retry them from the list.");
  }

  async function setCover(file: File) {
    const [id] = await coverQueue.run([file], "article", {
      entryId: entry?.id,
    });
    if (id) setCoverId(id);
  }

  function editLink(e: Editor) {
    const current = String(e.getAttributes("link").href ?? "");
    const input = window.prompt(
      "Link address (leave empty to remove the link)",
      current || "https://",
    );
    if (input === null) return;
    const href = safeHref(input);
    if (!input.trim() || input.trim() === "https://") {
      e.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (!href) {
      notify(
        "Use a full web address starting with https://, or a page path like /work.",
      );
    } else {
      e.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
  }

  function editImageText(e: Editor) {
    const attrs = e.getAttributes("image");
    const alt = window.prompt(
      "Describe this image for screen readers and search engines",
      String(attrs.alt ?? ""),
    );
    if (alt === null) return;
    const caption = window.prompt(
      "Caption shown under the image (optional)",
      String(attrs.title ?? ""),
    );
    e.chain()
      .focus()
      .updateAttributes("image", {
        alt: alt.trim(),
        title: (caption ?? "").trim(),
      })
      .run();
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    const result = await onSave({
      kind: "article",
      title,
      subtitle,
      extra: category,
      slug,
      seo_title: seoTitle,
      seo_description: seoDescription,
      cover_id: coverId,
      published,
      sort_order: entry?.sort_order ?? 0,
      content: editor.getJSON(),
    });
    if (result?.slug) setSlug(result.slug);
  }

  const shownSlug = slug || slugify(title) || "your-article";
  const searchTitle = seoTitle || title || "Article title";
  const searchDescription = describe(
    seoDescription ||
      subtitle ||
      text ||
      "Your article's description appears here.",
  );
  const origin = typeof window === "undefined" ? "" : window.location.host;
  const minutes = readingMinutes(
    text || plainText(sanitizeDoc(entry?.content)),
  );

  return (
    <form className="article-editor" onSubmit={save}>
      <div className="article-main">
        <section className="panel editor-form">
          <label>
            Title
            <input
              className="article-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="A clear, specific headline"
            />
          </label>
          <label>
            Short introduction
            <textarea
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="One or two sentences shown under the title and in article lists."
            />
          </label>
        </section>

        <section className="panel rich-editor">
          {editor && (
            <Toolbar
              editor={editor}
              onLink={() => editLink(editor)}
              onImage={() => imageInput.current?.click()}
              onImageText={() => editImageText(editor)}
              disabled={uploading}
            />
          )}
          <input
            ref={imageInput}
            type="file"
            hidden
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void addImages(files);
            }}
          />
          <div className="editor-uploads">
            <UploadList
              queue={imageQueue}
              onRetried={(id) => insertImage(id)}
            />
          </div>
          <EditorContent editor={editor} />
          <p className="field-help editor-status" role="status">
            {`${text.split(/\s+/).filter(Boolean).length} words · about ${minutes} min read`}
          </p>
        </section>
      </div>

      <aside className="article-side">
        <section className="panel editor-form">
          <h2>Publishing</h2>
          <label className="check-label">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            Published
          </label>
          <p className="field-help">
            Drafts and their images are only visible to you while signed in.
          </p>
          <label>
            Category
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={200}
              placeholder="Process, Branding, Notes…"
            />
          </label>
          <label>
            URL
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={140}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder={slugify(title) || "created from the title"}
            />
          </label>
          <p className="field-help">/journal/{shownSlug}</p>
          <div className="form-actions">
            <button className="button dark" disabled={busy || uploading}>
              {busy ? "Saving…" : entry ? "Save article" : "Create article"} ↗
            </button>
            {entry && (
              <a
                className="text-link"
                href={`/journal/${entry.slug || entry.id}`}
                target="_blank"
                rel="noopener"
              >
                {entry.published ? "View" : "Preview"} ↗
              </a>
            )}
          </div>
        </section>

        <section className="panel editor-form">
          <h2>Cover image</h2>
          {coverId ? (
            <img
              className="article-cover-preview"
              src={`/media/${coverId}`}
              alt=""
            />
          ) : (
            <p className="field-help">
              Shown at the top of the article, in article lists, and when the
              link is shared on social media.
            </p>
          )}
          <input
            ref={coverInput}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void setCover(f);
            }}
          />
          <div className="row-actions">
            <button
              type="button"
              className="button"
              disabled={uploading}
              onClick={() => coverInput.current?.click()}
            >
              {coverId ? "Replace cover" : "Upload cover"} ↑
            </button>
            {coverId && (
              <button
                type="button"
                className="danger-text"
                onClick={() => setCoverId("")}
              >
                Remove
              </button>
            )}
          </div>
          <UploadList queue={coverQueue} onRetried={setCoverId} />
          <p className="field-help">Landscape works best, e.g. 1600 × 900.</p>
        </section>

        <section className="panel editor-form">
          <h2>Search & sharing</h2>
          <div className="search-preview" aria-label="Search result preview">
            <span className="search-preview-url">
              {origin} › journal › {shownSlug}
            </span>
            <span className="search-preview-title">{searchTitle}</span>
            <span className="search-preview-text">{searchDescription}</span>
          </div>
          <label>
            SEO title <Counter value={seoTitle} max={60} />
            <input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              maxLength={70}
              placeholder={title || "Uses the article title"}
            />
          </label>
          <label>
            Meta description <Counter value={seoDescription} max={160} />
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={3}
              maxLength={200}
              placeholder="Uses the short introduction"
            />
          </label>
          <p className="field-help">
            Optional. Leave blank to use the title and introduction.
          </p>
        </section>
      </aside>
    </form>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={`char-count ${value.length > max ? "over" : ""}`}>
      {value.length}/{max}
    </span>
  );
}

function Tool({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={active ? "active" : ""}
      disabled={disabled}
      // keep the text selection while clicking the toolbar
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Toolbar({
  editor: e,
  onLink,
  onImage,
  onImageText,
  disabled,
}: {
  editor: Editor;
  onLink: () => void;
  onImage: () => void;
  onImageText: () => void;
  disabled: boolean;
}) {
  const chain = () => e.chain().focus();
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <Tool
        label="Heading"
        active={e.isActive("heading", { level: 2 })}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        H2
      </Tool>
      <Tool
        label="Subheading"
        active={e.isActive("heading", { level: 3 })}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        H3
      </Tool>
      <Tool
        label="Small heading"
        active={e.isActive("heading", { level: 4 })}
        onClick={() => chain().toggleHeading({ level: 4 }).run()}
      >
        H4
      </Tool>
      <span className="toolbar-divider" />
      <Tool
        label="Bold"
        active={e.isActive("bold")}
        onClick={() => chain().toggleBold().run()}
      >
        <b>B</b>
      </Tool>
      <Tool
        label="Italic"
        active={e.isActive("italic")}
        onClick={() => chain().toggleItalic().run()}
      >
        <i>I</i>
      </Tool>
      <Tool
        label="Underline"
        active={e.isActive("underline")}
        onClick={() => chain().toggleUnderline().run()}
      >
        <u>U</u>
      </Tool>
      <Tool
        label="Strikethrough"
        active={e.isActive("strike")}
        onClick={() => chain().toggleStrike().run()}
      >
        <s>S</s>
      </Tool>
      <Tool label="Link" active={e.isActive("link")} onClick={onLink}>
        ↗ Link
      </Tool>
      <span className="toolbar-divider" />
      <Tool
        label="Bulleted list"
        active={e.isActive("bulletList")}
        onClick={() => chain().toggleBulletList().run()}
      >
        • List
      </Tool>
      <Tool
        label="Numbered list"
        active={e.isActive("orderedList")}
        onClick={() => chain().toggleOrderedList().run()}
      >
        1. List
      </Tool>
      <Tool
        label="Quote"
        active={e.isActive("blockquote")}
        onClick={() => chain().toggleBlockquote().run()}
      >
        “ Quote
      </Tool>
      <Tool label="Divider" onClick={() => chain().setHorizontalRule().run()}>
        —
      </Tool>
      <span className="toolbar-divider" />
      <Tool label="Insert image" disabled={disabled} onClick={onImage}>
        ▣ Image
      </Tool>
      {e.isActive("image") && (
        <Tool label="Image description and caption" onClick={onImageText}>
          Alt & caption
        </Tool>
      )}
      <span className="toolbar-divider" />
      <Tool
        label="Undo"
        disabled={!e.can().undo()}
        onClick={() => chain().undo().run()}
      >
        ↶
      </Tool>
      <Tool
        label="Redo"
        disabled={!e.can().redo()}
        onClick={() => chain().redo().run()}
      >
        ↷
      </Tool>
    </div>
  );
}

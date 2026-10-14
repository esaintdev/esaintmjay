"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  isEntryKind,
  type AdminData,
  type BooleanSettingKey,
  type Settings,
  type SocialLink,
  type TextSettingKey,
} from "../lib/types.ts";
import { errorMessage, apiCall } from "../lib/client.ts";
import { useConfirm } from "./ConfirmModal";
import ArticleEditor from "./ArticleEditor";
import { useUploadQueue, UploadList } from "./UploadQueue";
import { articlePath, formatDate } from "../lib/seo.ts";

type Tab =
  | "overview"
  | "groups"
  | "profile"
  | "service"
  | "experience"
  | "award"
  | "article"
  | "media"
  | "inbox"
  | "settings";
const tabs: [Tab, string][] = [
  ["overview", "Overview"],
  ["groups", "Work collections"],
  ["profile", "Profile & homepage"],
  ["service", "Services"],
  ["experience", "Experience"],
  ["award", "Awards"],
  ["article", "Articles"],
  ["media", "Portrait & CV"],
  ["inbox", "Inbox"],
  ["settings", "Site settings"],
];
const tabLabel = (t: Tab) => tabs.find((a) => a[0] === t)?.[1] ?? "";

/** Form fields as sent to the API; the server validates every value. */
type FormValues = Record<string, unknown>;
const val = (f: HTMLFormElement): FormValues =>
  Object.fromEntries(new FormData(f));

type Removable = "groups" | "assets" | "entries" | "messages";
type Orderable = "groups" | "assets" | "entries";
type ApiResult = { ok?: boolean; id?: string };

const profileSections: [string, [TextSettingKey, string, boolean?][]][] = [
  [
    "Your introduction",
    [
      ["name", "Display name"],
      ["role", "Professional title"],
      ["heroTitle", "Main headline", true],
      ["heroDescription", "Introductory text", true],
      ["availability", "Availability"],
      ["specialties", "Specialties (comma separated)"],
    ],
  ],
  [
    "About you",
    [
      ["aboutLabel", "Section label"],
      ["aboutTitle", "About headline", true],
      ["aboutIntro", "About introduction", true],
      ["aboutBody", "Your story", true],
      ["location", "Location"],
      ["experience", "Experience summary"],
    ],
  ],
  [
    "Portfolio & contact",
    [
      ["workTitle", "Work section title"],
      ["workDescription", "Work introduction", true],
      ["servicesTitle", "Services section title"],
      ["journalTitle", "Journal title"],
      ["journalDescription", "Journal introduction", true],
      ["contactTitle", "Contact headline", true],
      ["contactDescription", "Contact introduction", true],
      ["email", "Public email"],
      ["phone", "Public phone"],
    ],
  ],
];
const visibleSections: [BooleanSettingKey, string][] = [
  ["showServices", "Services"],
  ["showExperience", "Experience"],
  ["showAwards", "Awards"],
  ["showArticles", "Articles"],
];
const longText: TextSettingKey[] = [
  "journalDescription",
  "aboutIntro",
  "aboutBody",
  "heroDescription",
  "contactDescription",
  "workDescription",
];

type FieldProps = {
  label: string;
  name: string;
  value?: string | number | null;
  area?: boolean;
  type?: string;
  rows?: number;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  placeholder?: string;
  autoComplete?: string;
};
function Field({
  label,
  name,
  value,
  area = false,
  type,
  rows = 4,
  min,
  max,
  pattern,
  ...p
}: FieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  return (
    <label>
      {label}
      {area ? (
        <textarea name={name} defaultValue={value ?? ""} rows={rows} {...p} />
      ) : isPassword ? (
        <div className="password-wrap">
          <input
            name={name}
            type={show ? "text" : "password"}
            defaultValue={value ?? ""}
            {...p}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            title={show ? "Hide password" : "Show password"}
          >
            {show ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.6 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value ?? ""}
          min={min}
          max={max}
          pattern={pattern}
          {...p}
        />
      )}
    </label>
  );
}
function Check({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value?: boolean | null;
}) {
  return (
    <label className="check-label">
      <input type="checkbox" name={name} defaultChecked={!!value} />
      {label}
    </label>
  );
}
function Save({
  busy,
  children = "Save changes",
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <button className="button dark" disabled={busy}>
      {busy ? "Saving…" : children} ↗
    </button>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="admin-empty">
      <span className="star">✳</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export default function Admin() {
  const [data, setData] = useState<AdminData | null>(null),
    [tab, setTab] = useState<Tab>("overview"),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [mobile, setMobile] = useState(false);
  const { confirm: confirmModal, ConfirmModal: confirmModalElement } =
    useConfirm();
  const load = useCallback(async () => {
    const r = await fetch("/api/admin", { cache: "no-store" });
    if (r.status === 401) {
      location.assign("/admin/login");
      return;
    }
    const v = (await r.json()) as AdminData & { error?: string };
    if (!r.ok) throw new Error(v.error);
    setData(v);
  }, []);
  useEffect(() => {
    load().catch((e: unknown) => setNotice(errorMessage(e)));
  }, [load]);
  useEffect(() => {
    if (data) document.body.style.setProperty("--accent", data.settings.accent);
  }, [data]);
  const api = <T extends object = ApiResult>(
    url: string,
    method: "POST" | "PUT" | "DELETE" = "POST",
    v?: unknown,
  ): Promise<T> => apiCall<T>(url, method, v);
  async function run<T>(
    fn: () => Promise<T>,
    message = "Changes saved.",
  ): Promise<T | undefined> {
    if (busy) return;
    setBusy(true);
    try {
      const result = await fn();
      await load();
      setNotice(message);
      return result;
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function go(t: Tab, id: string | null = null) {
    setTab(t);
    setSelected(id);
    setQuery("");
    setMobile(false);
    window.scrollTo(0, 0);
  }
  async function remove(type: Removable, id: string, message?: string) {
    const ok = await confirmModal({
      title: "Confirm Deletion",
      message:
        message ||
        "Are you sure you want to permanently delete this item? This action cannot be undone.",
      confirmLabel: "Delete permanently",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    return run(() => api(`/api/admin/${type}/${id}`, "DELETE"), "Deleted.");
  }
  async function reorder(
    type: Orderable,
    items: { id: string }[],
    i: number,
    delta: -1 | 1,
  ) {
    const ids = items.map((a) => a.id);
    const a = ids[i],
      b = ids[i + delta];
    if (a === undefined || b === undefined) return;
    [ids[i], ids[i + delta]] = [b, a];
    return run(
      () => api("/api/admin/reorder", "POST", { resource: type, ids }),
      "Order updated.",
    );
  }
  const queues = {
    work: useUploadQueue(),
    portrait: useUploadQueue(),
    cv: useUploadQueue(),
  };
  type QueueKind = keyof typeof queues;
  async function upload(files: File[], kind: QueueKind, groupId?: string) {
    if (!files.length) return;
    const ids = await queues[kind].run(files, kind, { groupId });
    await load().catch((e: unknown) => setNotice(errorMessage(e)));
    const failed = files.length - ids.length;
    setNotice(
      failed
        ? `${ids.length} of ${files.length} uploaded. See the upload list for what went wrong.`
        : `${ids.length} uploaded.`,
    );
  }
  function orderButtons(type: Orderable, items: { id: string }[], i: number) {
    return (
      <>
        <button
          disabled={busy || i === 0}
          aria-label="Move earlier"
          onClick={() => reorder(type, items, i, -1)}
        >
          ↑
        </button>
        <button
          disabled={busy || i === items.length - 1}
          aria-label="Move later"
          onClick={() => reorder(type, items, i, 1)}
        >
          ↓
        </button>
      </>
    );
  }
  if (!data)
    return (
      <main id="main" className="error-page">
        <span className="star">✳</span>
        <h2>Opening your studio…</h2>
        {notice && (
          <>
            <p role="alert">{notice}</p>
            <button
              className="button"
              onClick={() =>
                load().catch((e: unknown) => setNotice(errorMessage(e)))
              }
            >
              Try again
            </button>
          </>
        )}
      </main>
    );
  const s = data.settings,
    g = data.groups.find((a) => a.id === selected),
    images = data.assets.filter((a) => a.group_id === selected),
    entry = data.entries.find((a) => a.id === selected),
    entryKind = isEntryKind(tab) ? tab : null,
    items = data.entries.filter((a) => a.kind === entryKind),
    unread = data.messages.filter((a) => !a.is_read).length;
  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar ${mobile ? "is-open" : ""}`}>
        <a className="brand" href="/">
          <span className="star">✳</span>
          {s.name}.
        </a>
        <p className="eyebrow sidebar-label">YOUR STUDIO</p>
        <nav aria-label="Admin navigation">
          {tabs.map(([id, label], i) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={tab === id ? "selected" : ""}
            >
              <span>
                {["◈", "▦", "↗", "✳", "↔", "☆", "≡", "↑", "✉", "◎"][i]}
              </span>
              {label}
              {id === "inbox" && unread > 0 && (
                <b className="badge">{unread}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="/" target="_blank" rel="noopener">
            View portfolio ↗
          </a>
          <button
            onClick={async () => {
              try {
                await api("/api/auth", "DELETE");
                location.assign("/admin/login");
              } catch (e) {
                setNotice(errorMessage(e));
              }
            }}
          >
            Sign out ↗
          </button>
        </div>
      </aside>
      <div className="admin-body">
        <header className="admin-topbar">
          <button
            className="mobile-toggle"
            onClick={() => setMobile(!mobile)}
            aria-expanded={mobile}
          >
            ☰ Menu
          </button>
          <span>Studio / {tabLabel(tab)}</span>
          <span className="admin-avatar">
            {s.name
              .split(" ")
              .map((a) => a[0])
              .slice(0, 2)
              .join("")}
          </span>
        </header>
        <main id="main" className="admin-content">
          <div className="admin-heading">
            <div>
              <p className="eyebrow">MAKE IT YOURS</p>
              <h1>
                {tab === "overview"
                  ? "Your work. Your world."
                  : tab === "groups" && selected
                    ? g?.name || "New collection"
                    : tabLabel(tab)}
              </h1>
              <p>
                {tab === "groups"
                  ? "One company or workplace. All its design jobs, together."
                  : "Your creative space. Keep your portfolio up to date."}
              </p>
            </div>
            {tab === "groups" && !selected && (
              <button
                className="button dark"
                onClick={() => setSelected("new")}
              >
                + New collection
              </button>
            )}
            {entryKind && !selected && (
              <button
                className="button dark"
                onClick={() => setSelected("new")}
              >
                + Add {tab}
              </button>
            )}
          </div>
          {tab === "overview" && (
            <>
              <div className="stats-grid">
                {(
                  [
                    [data.groups.length, "Collections", "groups"],
                    [
                      data.assets.filter((a) => a.kind === "work").length,
                      "Design uploads",
                      "groups",
                    ],
                    [
                      data.groups.filter((a) => a.published).length,
                      "Published",
                      "groups",
                    ],
                    [unread, "Unread enquiries", "inbox"],
                  ] satisfies [number, string, Tab][]
                ).map(([n, l, t]) => (
                  <button key={l} onClick={() => go(t)}>
                    <span>{l} ↗</span>
                    <strong>{String(n).padStart(2, "0")}</strong>
                  </button>
                ))}
              </div>
              <div className="dashboard-callout">
                <div>
                  <p className="eyebrow">Your next great collection</p>
                  <h2>
                    Give your work
                    <br />a place to live.
                  </h2>
                  <p>
                    Create a company or workplace, then bring all its designs
                    together.
                  </p>
                  <button
                    className="button"
                    onClick={() => go("groups", "new")}
                  >
                    Create a collection ↗
                  </button>
                </div>
                <span aria-hidden="true">✳</span>
              </div>
              <div className="two-col">
                <section className="panel">
                  <h2>Make yourself at home</h2>
                  {(
                    [
                      ["profile", "Write your introduction"],
                      ["media", "Add your portrait & CV"],
                      ["groups", "Publish your first collection"],
                      ["settings", "Add your social links"],
                    ] satisfies [Tab, string][]
                  ).map(([t, l]) => (
                    <button
                      className="checklist-item"
                      key={l}
                      onClick={() => go(t)}
                    >
                      {l}
                      <span>↗</span>
                    </button>
                  ))}
                </section>
                <section className="panel">
                  <h2>Recent collections</h2>
                  {data.groups.length ? (
                    data.groups.slice(0, 4).map((a) => (
                      <button
                        className="recent-item"
                        key={a.id}
                        onClick={() => go("groups", a.id)}
                      >
                        <span>
                          {a.name}
                          <small>{a.image_count} designs</small>
                        </span>
                        <span className="badge">
                          {a.published ? "Published" : "Draft"}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p>
                      Your first company collection starts here. Keep it in
                      draft until you are ready.
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
          {tab === "groups" && !selected && (
            <>
              <div className="admin-toolbar">
                <label className="search-label">
                  <span className="sr-only">Search collections</span>
                  <input
                    placeholder="Search collections…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <span>{data.groups.length} collections</span>
              </div>
              {data.groups.length ? (
                <div className="admin-collections">
                  {data.groups
                    .filter((a) =>
                      `${a.name} ${a.category}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((a) => (
                      <article key={a.id}>
                        <button
                          className="collection-cover"
                          onClick={() => setSelected(a.id)}
                          aria-label={`Edit ${a.name}`}
                        >
                          {a.image_id ? (
                            <img src={`/media/${a.image_id}`} alt={a.name} />
                          ) : (
                            <span className="star">✳</span>
                          )}
                          <span className="badge">
                            {a.published ? "Published" : "Draft"}
                          </span>
                        </button>
                        <div className="collection-info">
                          <p className="eyebrow">
                            {a.category || "Collection"}
                            {a.featured ? " / Featured" : ""}
                          </p>
                          <h2>{a.name}</h2>
                          <p>
                            {a.image_count} designs {a.year && `· ${a.year}`}
                          </p>
                          <div className="row-actions">
                            <button onClick={() => setSelected(a.id)}>
                              Edit collection ↗
                            </button>
                            {orderButtons(
                              "groups",
                              data.groups,
                              data.groups.indexOf(a),
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
              ) : (
                <Empty title="Your first collection starts here.">
                  Create a company, client, or workplace, then upload its design
                  jobs.
                </Empty>
              )}
            </>
          )}
          {tab === "groups" && selected && (
            <>
              <button className="back-button" onClick={() => setSelected(null)}>
                ← All collections
              </button>
              <div className="editor-layout">
                <form
                  className="panel editor-form"
                  key={selected}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const v = val(e.currentTarget);
                    v.published = !!v.published;
                    v.featured = !!v.featured;
                    const r = await run(
                      () =>
                        api(
                          `/api/admin/groups${g ? "/" + g.id : ""}`,
                          g ? "PUT" : "POST",
                          v,
                        ),
                      g
                        ? "Collection updated."
                        : "Collection created. Upload your designs below.",
                    );
                    if (r?.id) setSelected(r.id);
                  }}
                >
                  <h2>Collection details</h2>
                  <Field
                    label="Company / workplace / group name"
                    name="name"
                    value={g?.name}
                    required
                    maxLength={150}
                  />
                  <div className="two-col">
                    <Field
                      label="Category"
                      name="category"
                      value={g?.category}
                      maxLength={150}
                      placeholder="Brand identity"
                    />
                    <Field
                      label="Year / period"
                      name="year"
                      value={g?.year}
                      maxLength={50}
                      placeholder="2024–2026"
                    />
                  </div>
                  <Field
                    label="Your role"
                    name="role"
                    value={g?.role}
                    maxLength={150}
                  />
                  <Field
                    label="About this collection"
                    name="description"
                    value={g?.description}
                    area
                    maxLength={6000}
                  />
                  <Field
                    label="URL slug (blank = automatic)"
                    name="slug"
                    value={g?.slug}
                    maxLength={180}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  />
                  <div className="two-col">
                    <label>
                      Cover image
                      <select name="cover_id" defaultValue={g?.cover_id || ""}>
                        <option value="">First image in gallery</option>
                        {images.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      label="Display order"
                      name="sort_order"
                      type="number"
                      value={g?.sort_order ?? data.groups.length}
                      min={-10000}
                      max={10000}
                    />
                  </div>
                  <div className="toggle-row">
                    <Check
                      label="Published"
                      name="published"
                      value={g?.published}
                    />
                    <Check
                      label="Featured collection"
                      name="featured"
                      value={g?.featured}
                    />
                  </div>
                  <p className="field-help">
                    Draft collections and their images are private. Changing an
                    existing slug changes its public link.
                  </p>
                  <div className="form-actions">
                    <Save busy={busy}>
                      {g ? "Save collection" : "Create collection"}
                    </Save>
                    {g && (
                      <a
                        className="text-link"
                        href={`/work/${g.slug}`}
                        target="_blank"
                        rel="noopener"
                      >
                        {g.published ? "View" : "Preview"} ↗
                      </a>
                    )}
                  </div>
                </form>
                <aside>
                  <div className="panel editor-note">
                    <span className="star">✳</span>
                    <h3>
                      One company.
                      <br />
                      All its work.
                    </h3>
                    <p>
                      Add a cover, titles, and captions. Arrange the images to
                      tell the story.
                    </p>
                  </div>
                  {g && (
                    <div className="danger-zone">
                      <h3>Delete collection</h3>
                      <p>
                        This removes the collection and all {images.length}{" "}
                        images.
                      </p>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          const r = await remove(
                            "groups",
                            g.id,
                            `Delete ${g.name} and all ${images.length} images permanently?`,
                          );
                          if (r) setSelected(null);
                        }}
                      >
                        Delete collection
                      </button>
                    </div>
                  )}
                </aside>
              </div>
              {g && (
                <section className="panel gallery-editor">
                  <div className="panel-heading">
                    <div>
                      <h2>Design gallery / {images.length}</h2>
                      <p>
                        PNG, JPG, WebP, GIF · Up to 15 MB each. Select multiple
                        files.
                      </p>
                    </div>
                    <UploadButton
                      busy={busy || queues.work.active}
                      multiple
                      onFiles={(f) => upload(f, "work", g.id)}
                    >
                      Upload designs
                    </UploadButton>
                  </div>
                  <UploadList
                    queue={queues.work}
                    onRetried={() => void load()}
                  />
                  {images.length ? (
                    <div className="image-editor-grid">
                      {images.map((a, i) => (
                        <article className="image-editor" key={a.id}>
                          <img src={`/media/${a.id}`} alt={a.alt} />
                          <div className="row-actions image-tools">
                            <span>
                              {i + 1}
                              {g.cover_id === a.id ? " / Cover" : ""}
                            </span>
                            {orderButtons("assets", images, i)}
                            <button
                              className="danger-text"
                              disabled={busy}
                              onClick={() =>
                                remove("assets", a.id, `Delete ${a.title}?`)
                              }
                            >
                              Delete
                            </button>
                          </div>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              run(() =>
                                api("/api/admin/assets/" + a.id, "PUT", {
                                  ...val(e.currentTarget),
                                  sort_order: a.sort_order,
                                }),
                              );
                            }}
                          >
                            <Field
                              label="Design title"
                              name="title"
                              value={a.title}
                              required
                              maxLength={200}
                            />
                            <Field
                              label="Image description / alt text"
                              name="alt"
                              value={a.alt}
                              required
                              maxLength={500}
                            />
                            <Field
                              label="Caption"
                              name="caption"
                              value={a.caption}
                              area
                              rows={2}
                              maxLength={2000}
                            />
                            <Save busy={busy}>Save image details</Save>
                          </form>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty title="Bring this collection to life.">
                      Upload the work you created for this company.
                    </Empty>
                  )}
                </section>
              )}
            </>
          )}
          {tab === "profile" && (
            <form
              className="settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(() =>
                  api("/api/admin/settings", "PUT", val(e.currentTarget)),
                );
              }}
            >
              {profileSections.map(([heading, fields]) => (
                <section className="panel editor-form" key={heading}>
                  <h2>{heading}</h2>
                  {fields.map(([name, label, area]) => (
                    <Field
                      key={name}
                      name={name}
                      label={label}
                      area={area}
                      value={s[name]}
                      type={name === "email" ? "email" : "text"}
                      required={name === "name" || name === "heroTitle"}
                      maxLength={longText.includes(name) ? 4000 : 500}
                    />
                  ))}
                </section>
              ))}
              <div className="sticky-save">
                <Save busy={busy} />
                <span>Updates appear on your portfolio immediately.</span>
              </div>
            </form>
          )}
          {entryKind && (
            <>
              {selected ? (
                <>
                  <button
                    className="back-button"
                    onClick={() => setSelected(null)}
                  >
                    ← Back to list
                  </button>
                  {entryKind === "article" ? (
                    <ArticleEditor
                      key={selected}
                      entry={entry}
                      busy={busy}
                      notify={setNotice}
                      onSave={async (payload) => {
                        const r = await run(
                          () =>
                            api<ApiResult & { slug?: string }>(
                              `/api/admin/entries${entry ? "/" + entry.id : ""}`,
                              entry ? "PUT" : "POST",
                              payload,
                            ),
                          entry ? "Article saved." : "Article created.",
                        );
                        // keep editing the new article after its first save
                        if (r?.id && !entry) setSelected(r.id);
                        return r;
                      }}
                    />
                  ) : (
                    <form
                      className="panel editor-form entry-form"
                      key={selected}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const v = val(e.currentTarget);
                        const r = await run(() =>
                          api(
                            `/api/admin/entries${entry ? "/" + entry.id : ""}`,
                            entry ? "PUT" : "POST",
                            { ...v, kind: entryKind, published: !!v.published },
                          ),
                        );
                        if (r) setSelected(null);
                      }}
                    >
                      <h2>
                        {entry ? "Edit" : "Add"} {tab}
                      </h2>
                      <Field
                        label={
                          tab === "experience" ? "Position / role" : "Title"
                        }
                        name="title"
                        value={entry?.title}
                        required
                        maxLength={200}
                      />
                      <Field
                        label={
                          tab === "article"
                            ? "Short introduction"
                            : tab === "experience"
                              ? "Company / workplace"
                              : "Subtitle / organisation"
                        }
                        name="subtitle"
                        value={entry?.subtitle}
                        maxLength={300}
                      />
                      <Field
                        label={
                          tab === "article"
                            ? "Article body (blank lines separate paragraphs)"
                            : "Description"
                        }
                        name="body"
                        value={entry?.body}
                        area
                        rows={tab === "article" ? 14 : 5}
                        maxLength={30000}
                      />
                      <div className="two-col">
                        <Field
                          label={
                            tab === "article"
                              ? "Category / date"
                              : "Year / additional label"
                          }
                          name="extra"
                          value={entry?.extra}
                          maxLength={200}
                        />
                        <Field
                          label="Display order"
                          name="sort_order"
                          type="number"
                          value={entry?.sort_order ?? items.length}
                        />
                      </div>
                      <Check
                        label="Published"
                        name="published"
                        value={entry?.published}
                      />
                      <div className="form-actions">
                        <Save busy={busy} />
                        {entry && tab === "article" && (
                          <a
                            className="text-link"
                            href={`/journal/${entry.id}`}
                            target="_blank"
                            rel="noopener"
                          >
                            Preview ↗
                          </a>
                        )}
                      </div>
                    </form>
                  )}
                </>
              ) : (
                <section className="panel">
                  {items.length ? (
                    items.map((a, i) => (
                      <article className="entry-row" key={a.id}>
                        <div>
                          <span className="badge">
                            {a.published ? "Published" : "Draft"}
                          </span>
                          <h2>{a.title}</h2>
                          <p>{a.subtitle || a.body.slice(0, 130)}</p>
                          {a.kind === "article" && a.published_at && (
                            <p className="field-help">
                              Published {formatDate(a.published_at)} ·{" "}
                              <a
                                className="text-link"
                                href={articlePath(a)}
                                target="_blank"
                                rel="noopener"
                              >
                                View ↗
                              </a>
                            </p>
                          )}
                        </div>
                        <div className="row-actions">
                          {/* articles are listed newest first, not by hand */}
                          {a.kind !== "article" &&
                            orderButtons("entries", items, i)}
                          <button onClick={() => setSelected(a.id)}>
                            Edit ↗
                          </button>
                          <button
                            className="danger-text"
                            disabled={busy}
                            onClick={() =>
                              remove(
                                "entries",
                                a.id,
                                a.kind === "article"
                                  ? `Delete “${a.title}” and its images permanently?`
                                  : undefined,
                              )
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <Empty title={`Add your ${tabLabel(tab).toLowerCase()}.`}>
                      Optional sections appear once you publish their content.
                    </Empty>
                  )}
                </section>
              )}
            </>
          )}
          {tab === "media" && (
            <div className="two-col media-panels">
              {(
                [
                  ["portrait", "Your portrait", "portraitId"],
                  ["cv", "Your CV", "cvId"],
                ] satisfies ["portrait" | "cv", string, "portraitId" | "cvId"][]
              ).map(([kind, title, key]) => (
                <section className="panel" key={kind}>
                  <h2>{title}</h2>
                  <p>
                    {kind === "cv"
                      ? "Upload a PDF. Visitors can download it from the homepage and About section."
                      : "Add your own photo to the homepage hero."}
                  </p>
                  {s[key] ? (
                    kind === "portrait" ? (
                      <img
                        className="portrait-preview"
                        src={`/media/${s[key]}`}
                        alt="Your portrait"
                      />
                    ) : (
                      <div className="cv-preview">
                        <span>↧</span>
                        <h3>Your CV is ready.</h3>
                        <a className="text-link" href={`/media/${s[key]}`}>
                          Download current CV ↓
                        </a>
                      </div>
                    )
                  ) : (
                    <div className="cv-preview">
                      <span className="star">✳</span>
                      <h3>
                        {kind === "cv"
                          ? "Your story, on paper."
                          : "Put a face to the name."}
                      </h3>
                    </div>
                  )}
                  <UploadButton
                    busy={busy || queues[kind].active}
                    pdf={kind === "cv"}
                    onFiles={(f) => upload(f, kind)}
                  >
                    {s[key] ? "Replace" : "Upload"}{" "}
                    {kind === "cv" ? "CV" : "portrait"}
                  </UploadButton>
                  <p className="field-help">
                    {kind === "cv"
                      ? "PDF · Up to 10 MB"
                      : "PNG, JPG, WebP, GIF · Up to 15 MB"}
                  </p>
                  {s[key] && (
                    <button
                      className="danger-text"
                      disabled={busy}
                      onClick={() =>
                        remove("assets", s[key], `Remove your ${kind}?`)
                      }
                    >
                      Remove {kind}
                    </button>
                  )}
                  <UploadList
                    queue={queues[kind]}
                    onRetried={() => void load()}
                  />
                </section>
              ))}
            </div>
          )}
          {tab === "inbox" && (
            <section className="panel">
              {data.messages.length ? (
                data.messages.map((m) => (
                  <details
                    className={`message-item ${m.is_read ? "" : "unread"}`}
                    key={m.id}
                  >
                    <summary>
                      <span className="message-dot" />
                      <span>
                        <strong>{m.subject}</strong>
                        <span>
                          {m.name} · {m.email}
                        </span>
                      </span>
                      <time>{new Date(m.created_at).toLocaleDateString()}</time>
                    </summary>
                    <div className="message-body">
                      <p>{m.message}</p>
                      <div className="row-actions">
                        <a
                          className="button"
                          href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + m.subject)}`}
                        >
                          Reply by email ↗
                        </a>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              api(`/api/admin/messages/${m.id}`, "PUT", {
                                is_read: !m.is_read,
                              }),
                            )
                          }
                        >
                          Mark {m.is_read ? "unread" : "read"}
                        </button>
                        <button
                          className="danger-text"
                          disabled={busy}
                          onClick={() => remove("messages", m.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </details>
                ))
              ) : (
                <Empty title="A quiet inbox. For now.">
                  Enquiries from your contact form appear here.
                </Empty>
              )}
            </section>
          )}
          {tab === "settings" && (
            <>
              <SiteSettings
                s={s}
                busy={busy}
                save={(v) => run(() => api("/api/admin/settings", "PUT", v))}
              />
              <form
                className="panel editor-form security-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const v = val(e.currentTarget);
                  if (v.password !== v.confirm) {
                    setNotice("New passwords do not match.");
                    return;
                  }
                  const r = await run(() =>
                    api("/api/admin/password", "PUT", v),
                  );
                  if (r) location.assign("/admin/login");
                }}
              >
                <h2>Account security</h2>
                <p>Changing your account signs out all active sessions.</p>
                <Field
                  label="Admin email"
                  name="email"
                  type="email"
                  value={data.adminEmail}
                  required
                  autoComplete="username"
                />
                <Field
                  label="Current password"
                  name="current"
                  type="password"
                  required
                  maxLength={256}
                  autoComplete="current-password"
                />
                <div className="two-col">
                  <Field
                    label="New password"
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={256}
                    autoComplete="new-password"
                  />
                  <Field
                    label="Confirm new password"
                    name="confirm"
                    type="password"
                    required
                    minLength={12}
                    maxLength={256}
                    autoComplete="new-password"
                  />
                </div>
                <Save busy={busy}>Update account</Save>
              </form>
            </>
          )}
        </main>
        <footer className="admin-footer">
          {s.name} / Creative studio <span>Your next chapter starts here.</span>
        </footer>
      </div>
      {notice && (
        <div className="toast" role="status">
          <p>{notice}</p>
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
      {confirmModalElement}
    </div>
  );
}
function UploadButton({
  busy,
  multiple = false,
  pdf = false,
  onFiles,
  children,
}: {
  busy: boolean;
  multiple?: boolean;
  pdf?: boolean;
  onFiles: (files: File[]) => void;
  children: ReactNode;
}) {
  return (
    <label className="button dark upload-button">
      {children} ↑
      <input
        type="file"
        accept={
          pdf ? "application/pdf" : "image/png,image/jpeg,image/webp,image/gif"
        }
        multiple={multiple}
        disabled={busy}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </label>
  );
}
function SiteSettings({
  s,
  busy,
  save,
}: {
  s: Settings;
  busy: boolean;
  save: (v: FormValues) => void;
}) {
  const [links, setLinks] = useState<SocialLink[]>(s.socialLinks);
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        const v = val(e.currentTarget);
        for (const [k] of visibleSections) v[k] = !!v[k];
        save({ ...v, socialLinks: links });
      }}
    >
      <section className="panel editor-form">
        <h2>Search & appearance</h2>
        <Field
          label="Search title"
          name="seoTitle"
          value={s.seoTitle}
          required
          maxLength={500}
        />
        <Field
          label="Search description"
          name="seoDescription"
          value={s.seoDescription}
          area
          maxLength={500}
        />
        <Field
          label="Accent colour"
          name="accent"
          type="color"
          value={s.accent}
        />
        <Field
          label="Footer note"
          name="footerNote"
          value={s.footerNote}
          maxLength={500}
        />
        <p className="field-help">
          Choose a colour that stays readable against the off-white background.
        </p>
      </section>
      <section className="panel editor-form">
        <h2>Visible sections</h2>
        <div className="toggle-grid">
          {visibleSections.map(([name, label]) => (
            <Check key={name} name={name} label={label} value={s[name]} />
          ))}
        </div>
      </section>
      <section className="panel editor-form">
        <h2>Social links</h2>
        {links.map((l, i) => (
          <div className="social-editor" key={i}>
            <label>
              Label
              <input
                required
                maxLength={50}
                value={l.label}
                onChange={(e) =>
                  setLinks(
                    links.map((a, j) =>
                      j === i ? { ...a, label: e.target.value } : a,
                    ),
                  )
                }
              />
            </label>
            <label>
              URL
              <input
                type="url"
                required
                value={l.url}
                onChange={(e) =>
                  setLinks(
                    links.map((a, j) =>
                      j === i ? { ...a, url: e.target.value } : a,
                    ),
                  )
                }
                placeholder="https://…"
              />
            </label>
            <button
              type="button"
              onClick={() => setLinks(links.filter((_, j) => j !== i))}
              aria-label="Remove social link"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button"
          disabled={links.length >= 10}
          onClick={() => setLinks([...links, { label: "", url: "" }])}
        >
          + Add social link
        </button>
      </section>
      <div className="sticky-save">
        <Save busy={busy}>Save site settings</Save>
      </div>
    </form>
  );
}

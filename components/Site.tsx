import Link from "next/link";
import type { GroupSummary, Settings } from "../lib/types.ts";
import SiteNav from "./SiteNav";

/**
 * Inline SVG icons. These are drawn rather than typed: characters like
 * the eight-spoked asterisk (U+2733) and the north-east arrow (U+2197)
 * belong to the emoji set, and iOS renders them as the green asterisk /
 * blue arrow emoji instead of text.
 */
export function StarIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7" />
    </svg>
  );
}
export function Star() {
  return (
    <span className="star" aria-hidden="true">
      <StarIcon />
    </span>
  );
}
export function Arrow() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
export function ArrowsH() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
    </svg>
  );
}
export function MailIcon() {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7.5 8 5.5 8-5.5" />
    </svg>
  );
}
export function Header({ settings: s }: { settings: Settings }) {
  return (
    <header className="site-header wrap">
      <Link className="brand" href="/">
        <Star />
        <span>
          {s.name}
          <b>.</b>
        </span>
      </Link>
      <Link className="button header-cta" href="/contact">
        <span>Let’s talk <Arrow /></span>
      </Link>
      <SiteNav
        links={[
          { href: "/work", label: "Work" },
          { href: "/about", label: "About" },
          ...(s.showServices ? [{ href: "/services", label: "Services" }] : []),
          ...(s.showArticles ? [{ href: "/journal", label: "Journal" }] : []),
          { href: "/contact", label: "Contact" },
        ]}
      />
    </header>
  );
}
export function Footer({ settings: s }: { settings: Settings }) {
  return (
    <footer className="site-footer wrap">
      <Link className="brand" href="/">
        <Star />
        {s.name}
        <b>.</b>
      </Link>
      <address className="footer-contact">
        {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
        {s.phone && (
          <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>{s.phone}</a>
        )}
        {s.location && <span>{s.location}</span>}
        <Link href="/contact">Send a message <Arrow /></Link>
      </address>
      <div className="socials">
        {s.socialLinks.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label} <Arrow />
          </a>
        ))}
      </div>
      <div className="footer-bottom">
        <p>
          © {new Date().getFullYear()} {s.name}. {s.footerNote}
        </p>
        <a href="#top">Back to top ↑</a>
      </div>
    </footer>
  );
}
export function SectionTitle({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">
          <Star />
          {number}
        </p>
        <h2>{title}</h2>
      </div>
      {description && <p>{description}</p>}
    </div>
  );
}
export function GroupCard({
  group: g,
  index,
}: {
  group: GroupSummary;
  index: number;
}) {
  return (
    <Link className="work-card" href={`/work/${g.slug}`}>
      <div className="work-image">
        {g.image_id ? (
          <img
            src={`/media/${g.image_id}`}
            alt={`${g.name} — ${g.category || "design work"}`}
            loading="lazy"
          />
        ) : (
          <div className="work-placeholder">
            <Star />
            <span>{g.name}</span>
          </div>
        )}
        <span className="work-open" aria-hidden="true">
          <Arrow />
        </span>
        {g.featured && <span className="badge work-featured">Featured</span>}
      </div>
      <div className="work-caption">
        <div>
          <p className="eyebrow">{g.category || "Design collection"}</p>
          <h3>{g.name}</h3>
        </div>
        <span>
          {String(index + 1).padStart(2, "0")} / {g.image_count}{" "}
          {g.image_count === 1 ? "design" : "designs"}
        </span>
      </div>
    </Link>
  );
}

export { default as ConfirmModal, useConfirm } from "./ConfirmModal";
export type { ConfirmOptions, ConfirmModalProps } from "./ConfirmModal";

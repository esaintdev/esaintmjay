import Link from "next/link";
import type { GroupSummary, Settings } from "../lib/types.ts";
export function Star() {
  return (
    <span aria-hidden="true" className="star">
      ✳
    </span>
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
      <nav aria-label="Main navigation">
        <Link href="/#work">Work</Link>
        <Link href="/#about">About</Link>
        {s.showServices && <Link href="/#services">Services</Link>}
      </nav>
      <Link className="button" href="/#contact">
        Let’s talk ↗
      </Link>
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
      <div className="socials">
        {s.socialLinks.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label} ↗
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
          ↗
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

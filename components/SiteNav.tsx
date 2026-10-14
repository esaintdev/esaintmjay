"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import { useEffect, useId, useRef, useState } from "react";

export type NavLink = { href: string; label: string };

/** Below this width the links collapse into the menu button. */
const COLLAPSE = "(max-width: 980px)";

/**
 * Main navigation. On wide screens the links sit in the header; on tablets
 * and phones a menu button opens them as a full-screen panel.
 */
export default function SiteNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const lenis = useLenis();
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // close when the page changes
  useEffect(() => setOpen(false), [pathname]);

  // while open: stop page scrolling, close on Escape, close if the screen
  // becomes wide enough for the normal header
  useEffect(() => {
    if (!open) return;
    lenis?.stop();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("a")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    const media = window.matchMedia(COLLAPSE);
    const onResize = () => !media.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    media.addEventListener("change", onResize);
    return () => {
      lenis?.start();
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onResize);
    };
  }, [open, lenis]);

  const current = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className={`nav-toggle ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="nav-toggle-label">{open ? "Close" : "Menu"}</span>
        <span className="nav-toggle-icon" aria-hidden="true">
          <span />
          <span />
        </span>
      </button>
      <nav
        ref={panel}
        id={id}
        aria-label="Main navigation"
        className={`site-nav ${open ? "is-open" : ""}`}
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={current(l.href) ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {l.label}
          </Link>
        ))}
        <Link
          className="button dark nav-panel-cta"
          href="/contact"
          onClick={() => setOpen(false)}
        >
          Let’s talk ↗
        </Link>
      </nav>
    </>
  );
}

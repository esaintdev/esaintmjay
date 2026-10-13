import "./globals.css";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { getSettings } from "../lib/db.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { default: s.seoTitle, template: `%s — ${s.name}` },
    description: s.seoDescription,
  };
}

export default async function Layout({ children }: { children: ReactNode }) {
  const s = await getSettings();
  return (
    <html lang="en">
      <body style={{ "--accent": s.accent } as CSSProperties}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

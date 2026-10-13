import "./globals.css";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { Sofia_Sans } from "next/font/google";
import { getSettings } from "../lib/db.ts";

const sofiaSans = Sofia_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sofia-sans",
});

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
    <html lang="en" className={sofiaSans.variable} suppressHydrationWarning>
      <body
        className={sofiaSans.className}
        style={{ "--accent": s.accent } as CSSProperties}
        suppressHydrationWarning
      >
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

import "./globals.css";
import "lenis/dist/lenis.css";
import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import { Sofia_Sans } from "next/font/google";
import { getSettings } from "../lib/db.ts";
import { origin } from "../lib/seo.ts";
import SmoothScroll from "../components/SmoothScroll";

const sofiaSans = Sofia_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sofia-sans",
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const image = s.portraitId ? [{ url: `/media/${s.portraitId}` }] : [];
  return {
    // absolute URLs for canonical links and social previews
    metadataBase: new URL(origin()),
    title: { default: s.seoTitle, template: `%s — ${s.name}` },
    description: s.seoDescription,
    openGraph: {
      type: "website",
      siteName: s.name,
      title: s.seoTitle,
      description: s.seoDescription,
      images: image,
    },
    twitter: {
      card: "summary",
      title: s.seoTitle,
      description: s.seoDescription,
    },
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
        <SmoothScroll>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}

import "./globals.css";
import { getSettings } from "../lib/db.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const s = await getSettings();
  return {
    title: { default: s.seoTitle, template: `%s — ${s.name}` },
    description: s.seoDescription,
  };
}
export default async function Layout({ children }) {
  const s = await getSettings();
  return (
    <html lang="en">
      <body style={{ "--accent": s.accent }}>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

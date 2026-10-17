import type { Metadata } from "next";
import { getSettings } from "../../lib/db.ts";
import { Header, Footer, Star, Arrow } from "../../components/Site";
import Contact from "../../components/Contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: "Contact",
    alternates: { canonical: "/contact" },
    description: s.contactDescription || `Get in touch with ${s.name}`,
  };
}

export default async function ContactPage() {
  const s = await getSettings();
  return (
    <div id="top">
      <Header settings={s} />
      <main id="main" className="contact-page">
        <section id="contact" className="contact-section">
          <div className="wrap contact-layout">
            <div>
              <Star />
              <p className="eyebrow">A conversation is a good start</p>
              <h2>{s.contactTitle}</h2>
              <p>{s.contactDescription}</p>
              {s.email && (
                <a className="contact-email" href={`mailto:${s.email}`}>
                  {s.email} <Arrow />
                </a>
              )}
              {s.phone && <p>{s.phone}</p>}
            </div>
            <Contact />
          </div>
        </section>
      </main>
      <Footer settings={s} />
    </div>
  );
}

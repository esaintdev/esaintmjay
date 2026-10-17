import Link from "next/link";
import type { Metadata } from "next";
import { getSettings, entries } from "../../lib/db.ts";
import { Header, Footer, Arrow, SectionTitle } from "../../components/Site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: "Services",
    alternates: { canonical: "/services" },
    description:
      s.servicesTitle ||
      `Creative capabilities and services provided by ${s.name}`,
  };
}

export default async function ServicesPage() {
  const [s, services] = await Promise.all([getSettings(), entries("service")]);

  return (
    <div id="top">
      <Header settings={s} />
      <main id="main">
        <section className="section wrap page-top-section">
          <SectionTitle
            number="02 / Creative capabilities"
            title={s.servicesTitle}
            description="From the first idea to the final detail."
          />
          {services.length ? (
            <div className="services-grid">
              {services.map((e, i) => (
                <article className="service" key={e.id}>
                  <div className="service-top">
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <span><Arrow /></span>
                  </div>
                  <h3>{e.title}</h3>
                  <p>{e.body}</p>
                  {e.subtitle && <p className="service-tags">{e.subtitle}</p>}
                </article>
              ))}
            </div>
          ) : (
            <div className="specialty-list">
              {s.specialties
                .split(",")
                .filter(Boolean)
                .map((v, i) => (
                  <div key={i}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <h3>{v.trim()}</h3>
                    <span><Arrow /></span>
                  </div>
                ))}
            </div>
          )}
          <div style={{ marginTop: "70px", textAlign: "center" }}>
            <Link className="button dark" href="/contact">
              <span>Let’s work together <Arrow /></span>
            </Link>
          </div>
        </section>
      </main>
      <Footer settings={s} />
    </div>
  );
}

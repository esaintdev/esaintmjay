import type { Metadata } from "next";
import { getSettings, entries } from "../../lib/db.ts";
import { Header, Footer, Star, SectionTitle } from "../../components/Site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: `About — ${s.name}`,
    description: s.aboutIntro || s.aboutBody.slice(0, 160) || `About ${s.name}`,
  };
}

export default async function AboutPage() {
  const [s, awards, experience] = await Promise.all([
    getSettings(),
    entries("award"),
    entries("experience"),
  ]);

  return (
    <div id="top">
      <Header settings={s} />
      <main id="main">
        <section id="about" className="about-section section wrap page-top-section">
          <div>
            <p className="eyebrow">
              <Star />
              {s.aboutLabel}
            </p>
            <h2>{s.aboutTitle}</h2>
            {s.cvId && (
              <a className="button" href={`/media/${s.cvId}`}>
                Download my CV ↓
              </a>
            )}
          </div>
          <div>
            <p className="about-intro">{s.aboutIntro}</p>
            <p className="body-copy">{s.aboutBody}</p>
            <div className="about-details">
              {s.location && (
                <div>
                  <p className="eyebrow">Based in</p>
                  <strong>{s.location}</strong>
                </div>
              )}
              {s.experience && (
                <div>
                  <p className="eyebrow">Experience</p>
                  <strong>{s.experience}</strong>
                </div>
              )}
              <div>
                <p className="eyebrow">Focus</p>
                <strong>{s.role}</strong>
              </div>
            </div>
          </div>
        </section>

        {s.showExperience && experience.length > 0 && (
          <section className="section wrap">
            <SectionTitle number="The journey" title="Experience" />
            <div className="editorial-list">
              {experience.map((e) => (
                <article key={e.id}>
                  <div>
                    <h3>{e.title}</h3>
                    <p>{e.subtitle}</p>
                  </div>
                  <p>{e.body}</p>
                  <span>{e.extra}</span>
                </article>
              ))}
            </div>
          </section>
        )}

        {s.showAwards && awards.length > 0 && (
          <section className="section wrap">
            <SectionTitle
              number="Recognition & accomplishments"
              title="Awards"
            />
            <div className="award-list">
              {awards.map((e, i) => (
                <article key={e.id}>
                  <span className="award-number">{i + 1}</span>
                  <div>
                    <h3>{e.title}</h3>
                    <p>{e.subtitle}</p>
                    {e.body && <p>{e.body}</p>}
                  </div>
                  <span className="award-year">{e.extra}</span>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer settings={s} />
    </div>
  );
}

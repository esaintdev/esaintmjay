import Link from "next/link";
import {
  getSettings,
  groups,
  entries,
  articles as latestArticles,
} from "../lib/db.ts";
import { articlePath } from "../lib/seo.ts";
import { Header, Footer, Star, SectionTitle } from "../components/Site";
import type { Metadata } from "next";
import WorkGrid from "../components/WorkGrid";
import Contact from "../components/Contact";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const [s, work, services, awards, experience, articles] = await Promise.all([
    getSettings(),
    groups(),
    entries("service"),
    entries("award"),
    entries("experience"),
    latestArticles(3),
  ]);
  return (
    <div id="top">
      <Header settings={s} />
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="status-dot" />
              {s.availability || s.role}
            </p>
            <p className="hero-intro">Hi, I’m {s.name}.</p>
            <h1>{s.heroTitle}</h1>
            <p className="hero-description">{s.heroDescription}</p>
            <div className="hero-actions">
              <a className="button dark" href="#work">
                Explore my work ↗
              </a>
              {s.cvId ? (
                <a className="button" href={`/media/${s.cvId}`}>
                  Download CV ↓
                </a>
              ) : (
                <a className="text-link" href="#about">
                  Get to know me ↗
                </a>
              )}
            </div>
          </div>
          <div className={`hero-art ${s.portraitId ? "has-portrait" : ""}`}>
            <div className="art-orbit" aria-hidden="true" />
            <div className="art-star" aria-hidden="true">
              ✳
            </div>
            {s.portraitId ? (
              <img
                src={`/media/${s.portraitId}`}
                alt={s.name}
                fetchPriority="high"
              />
            ) : (
              <div className="monogram" aria-hidden="true">
                <span>
                  {s.name
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <span className="monogram-small">
                  A point of view.
                  <br />A world of possibilities.
                </span>
              </div>
            )}
            <div className="art-note">
              <span>Independent creative</span>
              <strong>{s.role} ↗</strong>
            </div>
          </div>
        </section>
        <div className="specialties-strip">
          <div>
            {s.specialties
              .split(",")
              .filter(Boolean)
              .map((v, i) => (
                <span key={i}>
                  {v.trim()} <Star />
                </span>
              ))}
          </div>
        </div>
        <section id="work" className="section wrap">
          <SectionTitle
            number="01 / Selected collections"
            title={s.workTitle}
            description={s.workDescription}
          />
          <WorkGrid groups={work} />
        </section>
        <section id="about" className="about-section section wrap">
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
        {s.showServices && (
          <section id="services" className="section wrap">
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
                      <span>↗</span>
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
                      <span>↗</span>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}
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
        {s.showArticles && articles.length > 0 && (
          <section className="section wrap">
            <SectionTitle
              number="Notes from the studio"
              title={s.journalTitle}
              description={s.journalDescription}
            />
            <div className="article-list">
              {articles.map((e) => (
                <Link href={articlePath(e)} key={e.id}>
                  <div>
                    <p className="eyebrow">{e.extra || "Design notes"}</p>
                    <h3>{e.title}</h3>
                  </div>
                  <p>{e.subtitle}</p>
                  <span>↗</span>
                </Link>
              ))}
            </div>
            <p className="section-more">
              <Link className="text-link" href="/journal">
                All articles ↗
              </Link>
            </p>
          </section>
        )}
        <section id="contact" className="contact-section">
          <div className="wrap contact-layout">
            <div>
              <Star />
              <p className="eyebrow">A conversation is a good start</p>
              <h2>{s.contactTitle}</h2>
              <p>{s.contactDescription}</p>
              {s.email && (
                <a className="contact-email" href={`mailto:${s.email}`}>
                  {s.email} ↗
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

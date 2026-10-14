import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSettings, articles } from "../../lib/db.ts";
import { describe } from "../../lib/seo.ts";
import { Header, Footer, SectionTitle, Star } from "../../components/Site";
import JournalCard from "../../components/JournalCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: "Journal",
    description: describe(s.journalDescription || `Articles by ${s.name}`),
    alternates: { canonical: "/journal" },
    openGraph: { type: "website", url: "/journal", siteName: s.name },
  };
}

export default async function JournalPage() {
  const [s, list] = await Promise.all([getSettings(), articles()]);
  if (!s.showArticles) notFound();

  return (
    <div id="top">
      <Header settings={s} />
      <main id="main">
        <section className="section wrap page-top-section">
          <SectionTitle
            number="Journal / Notes from the studio"
            title={s.journalTitle}
            description={s.journalDescription}
          />
          {list.length ? (
            <div className="journal-grid">
              {list.map((a) => (
                <JournalCard key={a.id} article={a} />
              ))}
            </div>
          ) : (
            <div className="work-empty">
              <Star />
              <div>
                <h3>The first article is on its way.</h3>
                <p>Notes on design and process will appear here soon.</p>
              </div>
            </div>
          )}
        </section>
      </main>
      <Footer settings={s} />
    </div>
  );
}

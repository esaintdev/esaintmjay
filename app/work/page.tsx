import type { Metadata } from "next";
import { getSettings, groups } from "../../lib/db.ts";
import { Header, Footer, SectionTitle } from "../../components/Site";
import WorkGrid from "../../components/WorkGrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: `Work — ${s.name}`,
    description: s.workDescription || `Selected design collections and works by ${s.name}`,
  };
}

export default async function WorkPage() {
  const [s, work] = await Promise.all([getSettings(), groups()]);

  return (
    <div id="top">
      <Header settings={s} />
      <main id="main">
        <section id="work" className="section wrap page-top-section">
          <SectionTitle
            number="01 / Selected collections"
            title={s.workTitle}
            description={s.workDescription}
          />
          <WorkGrid groups={work} />
        </section>
      </main>
      <Footer settings={s} />
    </div>
  );
}

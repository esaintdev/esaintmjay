import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "../../../lib/supabase.mjs";
import { getSettings, groups, assets } from "../../../lib/db.mjs";
import { authenticated } from "../../../lib/auth";
import { Header, Footer, Star, GroupCard } from "../../../components/Site";
import Gallery from "../../../components/Gallery";

async function resolve(slug) {
  const { data: g, error } = await supabase()
    .from("groups")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !g || (!g.published && !(await authenticated()))) notFound();
  return g;
}

export async function generateMetadata({ params }) {
  const g = await resolve((await params).slug);
  return {
    title: g.name,
    description: g.description.slice(0, 160),
    robots: g.published ? undefined : { index: false, follow: false },
  };
}

export default async function Work({ params }) {
  const g = await resolve((await params).slug);
  const [s, images, allGroups] = await Promise.all([
    getSettings(),
    assets(g.id),
    groups(),
  ]);
  const more = allGroups.filter((a) => a.id !== g.id).slice(0, 2);

  return (
    <div id="top">
      <Header settings={s} />
      <main id="main" className="wrap">
        <div className="detail-heading">
          <Link className="text-link" href="/#work">
            ← All collections
          </Link>
          {!g.published && (
            <p className="preview-banner">
              Draft preview — only visible while signed in.
            </p>
          )}
          <p className="eyebrow">
            <Star />
            {g.category || "Design collection"}
          </p>
          <h1>{g.name}</h1>
          <div className="detail-meta">
            <p>{g.description}</p>
            <dl>
              {g.role && (
                <>
                  <dt>My role</dt>
                  <dd>{g.role}</dd>
                </>
              )}
              {g.year && (
                <>
                  <dt>Period</dt>
                  <dd>{g.year}</dd>
                </>
              )}
              <dt>Collection</dt>
              <dd>
                {images.length} {images.length === 1 ? "design" : "designs"}
              </dd>
            </dl>
          </div>
        </div>
        {images.length ? (
          <Gallery images={images} />
        ) : (
          <p className="empty-panel">
            Designs for this collection are coming soon.
          </p>
        )}
        {more.length > 0 && (
          <section className="section">
            <div className="section-heading">
              <h2>More to explore</h2>
              <Star />
            </div>
            <div className="work-grid">
              {more.map((a, i) => (
                <GroupCard key={a.id} group={a} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer settings={s} />
    </div>
  );
}

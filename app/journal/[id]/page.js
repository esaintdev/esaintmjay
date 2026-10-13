import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "../../../lib/supabase.mjs";
import { getSettings } from "../../../lib/db.mjs";
import { authenticated } from "../../../lib/auth";
import { Header, Footer, Star } from "../../../components/Site";

async function article(id) {
  const { data: a, error } = await supabase()
    .from("entries")
    .select("*")
    .eq("id", id)
    .eq("kind", "article")
    .maybeSingle();
  if (error || !a || (!a.published && !(await authenticated()))) notFound();
  return a;
}

export async function generateMetadata({ params }) {
  const a = await article((await params).id);
  return {
    title: a.title,
    description: a.subtitle,
    robots: a.published ? undefined : { index: false, follow: false },
  };
}

export default async function Article({ params }) {
  const [a, s] = await Promise.all([
    article((await params).id),
    getSettings(),
  ]);
  return (
    <div id="top">
      <Header settings={s} />
      <main id="main" className="article-page wrap">
        <Link className="text-link" href="/">
          ← Back to portfolio
        </Link>
        {!a.published && (
          <p className="preview-banner">
            Draft preview — only visible while signed in.
          </p>
        )}
        <p className="eyebrow">
          <Star />
          {a.extra || "Design notes"}
        </p>
        <h1>{a.title}</h1>
        <p className="article-deck">{a.subtitle}</p>
        <div className="prose">
          {a.body.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </main>
      <Footer settings={s} />
    </div>
  );
}

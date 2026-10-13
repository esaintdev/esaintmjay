import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabase } from "../../../lib/supabase.ts";
import { getSettings } from "../../../lib/db.ts";
import { authenticated } from "../../../lib/auth.ts";
import { Header, Footer, Star } from "../../../components/Site";
import type { Entry } from "../../../lib/types.ts";

type Props = { params: Promise<{ id: string }> };

async function article(id: string): Promise<Entry> {
  const { data: a, error } = await supabase()
    .from("entries")
    .select("*")
    .eq("id", id)
    .eq("kind", "article")
    .maybeSingle();
  if (error || !a || (!a.published && !(await authenticated()))) notFound();
  return a;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await article((await params).id);
  return {
    title: a.title,
    description: a.subtitle,
    robots: a.published ? undefined : { index: false, follow: false },
  };
}

export default async function Article({ params }: Props) {
  const [a, s] = await Promise.all([article((await params).id), getSettings()]);
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

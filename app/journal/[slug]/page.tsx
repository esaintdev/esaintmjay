import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getSettings, articles, findArticle } from "../../../lib/db.ts";
import { authenticated } from "../../../lib/auth.ts";
import {
  sanitizeDoc,
  docFromText,
  readingMinutes,
} from "../../../lib/richtext.ts";
import {
  siteUrl,
  formatDate,
  describe,
  articlePath,
} from "../../../lib/seo.ts";
import { Header, Footer, Star } from "../../../components/Site";
import RichText from "../../../components/RichText";
import JournalCard from "../../../components/JournalCard";
import type { Entry } from "../../../lib/types.ts";

type Props = { params: Promise<{ slug: string }> };

async function article(slugOrId: string): Promise<Entry> {
  const a = await findArticle(slugOrId);
  if (!a || (!a.published && !(await authenticated()))) notFound();
  // old /journal/<id> links move to the article's readable address
  if (a.slug && slugOrId !== a.slug) permanentRedirect(articlePath(a));
  return a;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [a, s] = await Promise.all([
    article((await params).slug),
    getSettings(),
  ]);
  const title = a.seo_title || a.title;
  const description = describe(a.seo_description || a.subtitle || a.body);
  const images = a.cover_id
    ? [{ url: `/media/${a.cover_id}`, alt: a.title }]
    : [];
  return {
    title: a.seo_title ? { absolute: a.seo_title } : a.title,
    description,
    alternates: { canonical: articlePath(a) },
    robots: a.published ? undefined : { index: false, follow: false },
    openGraph: {
      type: "article",
      title,
      description,
      url: articlePath(a),
      siteName: s.name,
      publishedTime: a.published_at ?? undefined,
      authors: [s.name],
      section: a.extra || undefined,
      images,
    },
    twitter: {
      card: images.length ? "summary_large_image" : "summary",
      title,
      description,
      images: images.map((i) => i.url),
    },
  };
}

export default async function Article({ params }: Props) {
  const [a, s, recent] = await Promise.all([
    article((await params).slug),
    getSettings(),
    articles(4),
  ]);
  const doc = sanitizeDoc(a.content) ?? docFromText(a.body);
  const more = recent.filter((r) => r.id !== a.id).slice(0, 3);
  const date = a.published_at ? formatDate(a.published_at) : "";

  // Structured data so search engines can show it as an article
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.seo_title || a.title,
    description: describe(a.seo_description || a.subtitle || a.body),
    url: siteUrl(articlePath(a)),
    mainEntityOfPage: siteUrl(articlePath(a)),
    datePublished: a.published_at ?? undefined,
    author: { "@type": "Person", name: s.name },
    publisher: { "@type": "Person", name: s.name },
    image: a.cover_id ? [siteUrl(`/media/${a.cover_id}`)] : undefined,
    articleSection: a.extra || undefined,
  };

  return (
    <div id="top">
      <Header settings={s} />
      <main id="main" className="article-page wrap">
        <script
          type="application/ld+json"
          // JSON-LD must be raw JSON; "<" is escaped so it can't close the tag
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <Link className="text-link" href="/journal">
          ← All articles
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
        {a.subtitle && <p className="article-deck">{a.subtitle}</p>}
        <p className="article-meta">
          {date && <time dateTime={a.published_at ?? undefined}>{date}</time>}
          {date && <span aria-hidden="true"> · </span>}
          <span>{readingMinutes(a.body)} min read</span>
        </p>
        {a.cover_id && (
          <figure className="article-cover">
            <img src={`/media/${a.cover_id}`} alt="" fetchPriority="high" />
          </figure>
        )}
        <div className="prose">
          <RichText doc={doc} />
        </div>
      </main>
      {more.length > 0 && (
        <section className="section wrap">
          <div className="section-heading">
            <h2>Keep reading</h2>
            <Star />
          </div>
          <div className="journal-grid">
            {more.map((r) => (
              <JournalCard key={r.id} article={r} />
            ))}
          </div>
        </section>
      )}
      <Footer settings={s} />
    </div>
  );
}

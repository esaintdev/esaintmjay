import type { MetadataRoute } from "next";
import { getSettings, groups, articles } from "../lib/db.ts";
import { siteUrl, articlePath } from "../lib/seo.ts";

export const dynamic = "force-dynamic";

/** /sitemap.xml — every public page, collection and article. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await getSettings();
  const [work, posts] = await Promise.all([
    groups(),
    s.showArticles ? articles() : Promise.resolve([]),
  ]);
  const pages = [
    "/",
    "/work",
    "/about",
    ...(s.showServices ? ["/services"] : []),
    ...(s.showArticles ? ["/journal"] : []),
    "/contact",
  ];
  return [
    ...pages.map((p) => ({ url: siteUrl(p) })),
    ...work.map((g) => ({ url: siteUrl(`/work/${g.slug}`) })),
    ...posts.map((a) => ({
      url: siteUrl(articlePath(a)),
      lastModified: a.published_at ?? undefined,
    })),
  ];
}

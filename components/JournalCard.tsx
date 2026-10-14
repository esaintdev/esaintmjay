import Link from "next/link";
import { articlePath, formatDate } from "../lib/seo.ts";
import { Star } from "./Site";
import type { Entry } from "../lib/types.ts";

export default function JournalCard({ article: a }: { article: Entry }) {
  return (
    <Link className="journal-card" href={articlePath(a)}>
      <div className="journal-image">
        {a.cover_id ? (
          <img src={`/media/${a.cover_id}`} alt="" loading="lazy" />
        ) : (
          <div className="work-placeholder">
            <Star />
          </div>
        )}
      </div>
      <p className="eyebrow">
        {a.extra || "Design notes"}
        {a.published_at && ` · ${formatDate(a.published_at)}`}
      </p>
      <h3>{a.title}</h3>
      {a.subtitle && <p>{a.subtitle}</p>}
    </Link>
  );
}

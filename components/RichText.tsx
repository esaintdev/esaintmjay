import { Fragment, type ReactNode } from "react";
import type { RichDoc, RichMark, RichNode } from "../lib/richtext.ts";
import { safeHref } from "../lib/richtext.ts";

/**
 * Renders a sanitized article document (see lib/richtext.ts) as React
 * elements. Unknown node types render nothing, and no HTML string is ever
 * injected, so stored content cannot add scripts or styles to the page.
 */
export default function RichText({ doc }: { doc: RichDoc }) {
  return <>{doc.content.map((n, i) => renderNode(n, i))}</>;
}

function withMark(children: ReactNode, mark: RichMark, key: number): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong key={key}>{children}</strong>;
    case "italic":
      return <em key={key}>{children}</em>;
    case "underline":
      return <u key={key}>{children}</u>;
    case "strike":
      return <s key={key}>{children}</s>;
    case "code":
      return <code key={key}>{children}</code>;
    case "link": {
      const href = safeHref(mark.attrs.href);
      if (!href) return children;
      const external = /^(https?:)?\/\//.test(href);
      return (
        <a
          key={key}
          href={href}
          {...(external
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {children}
        </a>
      );
    }
  }
}

function children(n: RichNode): ReactNode[] {
  return (n.content ?? []).map((c, i) => renderNode(c, i));
}

function renderNode(n: RichNode, key: number): ReactNode {
  switch (n.type) {
    case "text":
      return (
        <Fragment key={key}>
          {(n.marks ?? []).reduce<ReactNode>(
            (acc, m, i) => withMark(acc, m, i),
            n.text,
          )}
        </Fragment>
      );
    case "paragraph":
      return n.content?.length ? <p key={key}>{children(n)}</p> : null;
    case "heading": {
      const level = n.attrs?.level;
      if (level === 3) return <h3 key={key}>{children(n)}</h3>;
      if (level === 4) return <h4 key={key}>{children(n)}</h4>;
      return <h2 key={key}>{children(n)}</h2>;
    }
    case "bulletList":
      return <ul key={key}>{children(n)}</ul>;
    case "orderedList": {
      const start = Number(n.attrs?.start);
      return (
        <ol key={key} start={start > 1 ? start : undefined}>
          {children(n)}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{children(n)}</li>;
    case "blockquote":
      return <blockquote key={key}>{children(n)}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children(n)}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = String(n.attrs?.src ?? "");
      const alt = String(n.attrs?.alt ?? "");
      const title = String(n.attrs?.title ?? "");
      if (!src.startsWith("/media/")) return null;
      return (
        <figure key={key}>
          <img src={src} alt={alt} loading="lazy" decoding="async" />
          {title && <figcaption>{title}</figcaption>}
        </figure>
      );
    }
    default:
      return null;
  }
}

import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="error-page">
      <span className="star">✳</span>
      <p className="eyebrow">404 / A little off the page</p>
      <h1>This page isn’t here.</h1>
      <p>It may have moved, or it may still be in the studio.</p>
      <Link className="button dark" href="/">
        Back to the portfolio ↗
      </Link>
    </main>
  );
}

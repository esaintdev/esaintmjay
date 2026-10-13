import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="error-page">
      <span className="star">✳</span>
      <p className="eyebrow">404 / A little off the page</p>
      <h1>You came to a page we didn't mean to create.</h1>
      <p>Head back and try again.</p>
      <Link className="button dark" href="/">
        Back to the portfolio ↗
      </Link>
    </main>
  );
}

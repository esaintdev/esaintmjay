import Link from "next/link";
import { Star, Arrow } from "../components/Site";
export default function NotFound() {
  return (
    <main id="main" className="error-page">
      <Star />
      <p className="eyebrow">404 / A little off the page</p>
      <h1>You came to a page we didn't mean to create.</h1>
      <p>Head back and try again.</p>
      <Link className="button dark" href="/">
        <span>Back to the portfolio <Arrow /></span>
      </Link>
    </main>
  );
}

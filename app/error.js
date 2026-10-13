"use client";
export default function ErrorPage({ reset }) {
  return (
    <main id="main" className="error-page">
      <h1>Something interrupted the page.</h1>
      <p>Please try again in a moment.</p>
      <button className="button dark" onClick={() => reset()}>
        Try again ↗
      </button>
    </main>
  );
}

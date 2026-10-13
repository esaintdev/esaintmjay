"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../lib/client.ts";
function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3.6 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            Object.fromEntries(new FormData(e.currentTarget)),
          ),
        }),
        v = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(v.error);
      window.location.assign("/admin");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <main id="main" className="login-page">
      <div className="login-art">
        <span className="star">✳</span>
        <p className="eyebrow">Your creative space</p>
        <h1>
          Behind
          <br />
          the work.
        </h1>
        <p>
          A place for your ideas, your collections,
          <br />
          and everything you’re creating next.
        </p>
        <Link className="text-link" href="/">
          ← View portfolio
        </Link>
      </div>
      <div className="login-panel">
        <p className="eyebrow">Studio / Admin</p>
        <h2>Welcome back.</h2>
        <p>Sign in to manage your portfolio.</p>
        <form onSubmit={submit}>
          <label>
            Email address
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <div className="password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          <button className="button dark" disabled={busy}>
            {busy ? "Signing in…" : "Enter the studio ↗"}
          </button>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </form>
        <details className="setup-help">
          <summary>First time here?</summary>
          <p>
            Create your administrator account from the project folder with{" "}
            <code>npm run admin:setup</code>. The same command can reset a
            forgotten password.
          </p>
        </details>
      </div>
    </main>
  );
}

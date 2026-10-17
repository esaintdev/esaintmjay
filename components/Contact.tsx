"use client";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../lib/client.ts";
import { Arrow } from "./Site";
export default function Contact() {
  const [state, setState] = useState({
    busy: false,
    message: "",
    error: false,
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setState({ busy: true, message: "", error: false });
    try {
      const r = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        }),
        v = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(v.error);
      form.reset();
      setState({
        busy: false,
        message: "Thank you. Your message has been received.",
        error: false,
      });
    } catch (err) {
      setState({ busy: false, message: errorMessage(err), error: true });
    }
  }
  return (
    <form className="contact-form" onSubmit={submit}>
      <div className="two-col">
        <label>
          Your name
          <input
            name="name"
            required
            maxLength={150}
            autoComplete="name"
            placeholder="Your name"
          />
        </label>
        <label>
          Email address
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="you@company.com"
          />
        </label>
      </div>
      <label>
        What are you thinking?
        <input
          name="subject"
          required
          maxLength={200}
          placeholder="Brand identity, a campaign, something new…"
        />
      </label>
      <label>
        A little about your project
        <textarea
          name="message"
          required
          maxLength={6000}
          rows={4}
          placeholder="Tell me what you have in mind."
        />
      </label>
      <div className="honeypot" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <button className="button dark" disabled={state.busy}>
        {state.busy ? "Sending…" : <span>Send message <Arrow /></span>}
      </button>
      {state.message && (
        <p
          role="status"
          className={state.error ? "error-text" : "success-text"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

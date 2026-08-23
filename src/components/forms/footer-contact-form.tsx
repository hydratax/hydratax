"use client";

import { useActionState } from "react";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import {
  submitContactForm,
  type ContactFormState,
} from "@/server/actions/contact";

const initial: ContactFormState | null = null;

export function FooterContactForm() {
  const [state, action, pending] = useActionState(submitContactForm, initial);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300/80">
        Contact us
      </p>
      <p className="mt-2 text-sm text-white/65">
        Send a message to{" "}
        <a
          href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          className="font-semibold text-teal-200 hover:text-white"
        >
          {LEGAL_CONTACT_EMAIL}
        </a>
        . We typically reply within one working day.
      </p>

      {state?.ok ? (
        <p
          className="mt-4 rounded-lg border border-teal-400/30 bg-teal-950/40 px-3 py-3 text-sm text-teal-100"
          role="status"
        >
          {state.message}
        </p>
      ) : (
        <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-white/70">
            Name
            <input
              name="name"
              required
              autoComplete="name"
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-white outline-none ring-teal-400/40 placeholder:text-white/35 focus:ring-2"
              placeholder="Your name"
            />
          </label>
          <label className="block text-xs font-semibold text-white/70">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-white outline-none ring-teal-400/40 placeholder:text-white/35 focus:ring-2"
              placeholder="you@firm.co.uk"
            />
          </label>
          <label className="block text-xs font-semibold text-white/70 sm:col-span-2">
            Subject
            <input
              name="subject"
              required
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-white outline-none ring-teal-400/40 placeholder:text-white/35 focus:ring-2"
              placeholder="How can we help?"
              defaultValue="HydraTax enquiry"
            />
          </label>
          <label className="block text-xs font-semibold text-white/70 sm:col-span-2">
            Message
            <textarea
              name="message"
              required
              rows={4}
              minLength={10}
              className="mt-1.5 w-full resize-y rounded-lg border border-white/15 bg-ink px-3 py-2 text-sm text-white outline-none ring-teal-400/40 placeholder:text-white/35 focus:ring-2"
              placeholder="Tell us about your practice, filing needs, or a support question…"
            />
          </label>
          {/* Honeypot */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />
          {state && !state.ok ? (
            <p
              className="sm:col-span-2 rounded-lg border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-100"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-light text-sm disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send message"}
            </button>
            <a
              href={`mailto:${LEGAL_CONTACT_EMAIL}`}
              className="text-xs font-semibold text-white/55 hover:text-white"
            >
              Or email us directly
            </a>
          </div>
        </form>
      )}
    </div>
  );
}

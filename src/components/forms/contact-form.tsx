"use client";

import { useActionState, useMemo } from "react";
import {
  submitContactForm,
  type ContactFormState,
} from "@/server/actions/contact";

const initial: ContactFormState | null = null;

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContactForm, initial);
  const formStartedAt = useMemo(() => String(Date.now()), []);

  return (
    <div className="panel rounded-xl border border-line bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
        Contact us
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Sales, onboarding, or practice support. We keep our inbox address off
        this page to reduce spam and scam mail — please use the form.
      </p>

      {state?.ok ? (
        <p
          className="mt-4 rounded-lg border border-sea/25 bg-sea/5 px-3 py-3 text-sm text-ink"
          role="status"
        >
          {state.message}
        </p>
      ) : (
        <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="formStartedAt" value={formStartedAt} />
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 opacity-0"
          />

          <label className="block text-sm font-semibold text-ink">
            Name
            <input
              name="name"
              required
              minLength={2}
              autoComplete="name"
              className="input mt-1.5 w-full font-normal"
              placeholder="Your name"
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="input mt-1.5 w-full font-normal"
              placeholder="you@firm.co.uk"
            />
          </label>
          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Subject
            <input
              name="subject"
              required
              minLength={3}
              className="input mt-1.5 w-full font-normal"
              placeholder="How can we help?"
              defaultValue="HydraTax enquiry"
            />
          </label>
          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Message
            <textarea
              name="message"
              required
              rows={5}
              minLength={20}
              className="input mt-1.5 min-h-[8rem] w-full resize-y font-normal"
              placeholder="Tell us about your practice, filing needs, or a support question…"
            />
          </label>
          <label className="block text-sm font-semibold text-ink sm:col-span-2">
            Anti-spam check — what is 3 + 4?
            <input
              name="challenge"
              required
              inputMode="numeric"
              autoComplete="off"
              className="input mt-1.5 w-full font-normal"
              placeholder="Your answer"
            />
          </label>

          {state && !state.ok ? (
            <p
              className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger sm:col-span-2"
              role="alert"
            >
              {state.message}
            </p>
          ) : null}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary text-sm disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

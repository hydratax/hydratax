"use client";

import { useState, useTransition } from "react";
import {
  savePracticeLetterhead,
} from "@/server/actions/letterhead";
import type { PracticeLetterhead } from "@/lib/desk-profile";
import { messageFromUnknown } from "@/lib/action-error";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function LetterheadForm({ initial }: { initial: PracticeLetterhead }) {
  const [practiceName, setPracticeName] = useState(initial.practiceName);
  const [address, setAddress] = useState(initial.addressLines.join("\n"));
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [website, setWebsite] = useState(initial.website ?? "");
  const [footer, setFooter] = useState(initial.footerLines.join("\n"));
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          try {
            await savePracticeLetterhead({
              practiceName,
              addressLines: address.split("\n"),
              phone: phone || undefined,
              email: email || undefined,
              website: website || undefined,
              footerLines: footer.split("\n"),
              logoUrl: logoUrl || undefined,
            });
            setMsg("Letterhead saved — it wraps every client letter preview.");
          } catch (error) {
            setErr(messageFromUnknown(error, "Could not save letterhead"));
          }
        });
      }}
    >
      <h2 className="display text-xl text-ink">Practice letterhead</h2>
      <p className="text-sm text-ink-soft">
        Used on confirmation of director, income letters, mortgage references,
        and other formal letters under Forms and letters.
      </p>
      <label className="block">
        <span className="label">Practice name</span>
        <input
          className="input mt-1"
          value={practiceName}
          onChange={(e) => setPracticeName(e.target.value)}
          required
        />
      </label>
      <label className="block">
        <span className="label">Address (one line per row)</span>
        <textarea
          className="input mt-1 min-h-[5rem]"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={"1 High Street\nLondon\nEC1A 1BB"}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label">Phone</span>
          <input
            className="input mt-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Email</span>
          <input
            className="input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Website</span>
          <input
            className="input mt-1"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>
      <label className="block">
        <span className="label">Logo URL (optional)</span>
        <input
          className="input mt-1"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label className="block">
        <span className="label">Footer lines (one per row)</span>
        <textarea
          className="input mt-1 min-h-[4rem]"
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          placeholder="Partners: …&#10;Registered for AML supervision …"
        />
      </label>
      <FormErrorBanner error={err} />
      {msg && <p className="text-sm text-ok">{msg}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save letterhead"}
      </button>
    </form>
  );
}

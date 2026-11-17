"use client";

import { useState, useTransition } from "react";
import {
  DOCUMENT_PASSWORD_IDENTIFIERS,
  DOCUMENT_PASSWORD_SECTIONS,
  type DocumentPasswordIdentifier,
  type DocumentPasswordPolicy,
} from "@/lib/document-password-policy";
import { saveDocumentPasswordPolicy } from "@/server/actions/document-password-policy";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";

export function DocumentPasswordPolicyForm({
  initial,
}: {
  initial: DocumentPasswordPolicy;
}) {
  const [policy, setPolicy] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        start(async () => {
          try {
            const saved = await saveDocumentPasswordPolicy(policy);
            setPolicy(saved);
            setOk("Password protection saved for this practice.");
          } catch (err) {
            setError(messageFromUnknown(err, "Could not save"));
          }
        });
      }}
    >
      <FormErrorBanner error={error} />
      {ok ? <p className="text-sm text-sea">{ok}</p> : null}

      <p className="text-sm text-ink-soft">
        Choose which client identifier unlocks emailed packs for each desk.
        HydraTax never uses a shared practice password — the value comes from
        that client’s record (for example DOB on the person card, or company
        UTR on the limited company).
      </p>

      <div className="space-y-3">
        {DOCUMENT_PASSWORD_SECTIONS.map((section) => (
          <label
            key={section.id}
            className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0">
              <span className="block font-semibold text-ink">
                {section.label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {section.help}
              </span>
            </span>
            <select
              className="input mt-1 w-full max-w-xs shrink-0 sm:mt-0"
              value={policy[section.id]}
              onChange={(e) =>
                setPolicy((prev) => ({
                  ...prev,
                  [section.id]: e.target.value as DocumentPasswordIdentifier,
                }))
              }
            >
              {DOCUMENT_PASSWORD_IDENTIFIERS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="rounded-lg border border-line bg-sand/40 px-4 py-3 text-xs text-ink-soft">
        <p className="font-semibold text-ink">How clients open the file</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {DOCUMENT_PASSWORD_IDENTIFIERS.filter((i) => i.id !== "none").map(
            (opt) => (
              <li key={opt.id}>
                <span className="font-medium text-ink">{opt.label}:</span>{" "}
                {opt.hint}
              </li>
            ),
          )}
        </ul>
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save password protection"}
      </button>
    </form>
  );
}

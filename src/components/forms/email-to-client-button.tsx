"use client";

import { useState, useTransition } from "react";
import {
  emailClientArtifact,
  type ClientEmailArtifact,
} from "@/server/actions/email-artifacts";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export function EmailToClientButton({
  clientId,
  defaultEmail,
  subject,
  message,
  artifact,
  prepareArtifact,
  label = "Email client",
  className = "btn btn-secondary text-xs",
  compact = false,
  disabled = false,
}: {
  clientId: string;
  defaultEmail?: string | null;
  subject: string;
  message: string;
  artifact?: ClientEmailArtifact;
  /** Build artifact just before send (e.g. ensure CT draft exists). */
  prepareArtifact?: () => Promise<ClientEmailArtifact>;
  label?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [toEmail, setToEmail] = useState(defaultEmail ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOk(null);
          setOpen(true);
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className={
        compact
          ? "inline-flex flex-col gap-2 rounded-lg border border-line bg-white p-2 shadow-sm"
          : "w-full max-w-md space-y-2 rounded-xl border border-line bg-white p-3 shadow-sm"
      }
    >
      <label className="block text-xs font-semibold text-ink">
        Client email
        <input
          type="email"
          required
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          className="input mt-1 text-sm"
          placeholder="client@example.com"
        />
      </label>
      <FormErrorBanner error={error} />
      {ok ? <p className="text-xs text-ok">{ok}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary text-xs"
          disabled={pending || !toEmail.trim()}
          onClick={() => {
            setError(null);
            setOk(null);
            start(async () => {
              try {
                const resolved =
                  (await prepareArtifact?.()) ?? artifact;
                if (!resolved) {
                  throw new Error("Nothing to email.");
                }
                const res = await emailClientArtifact({
                  clientId,
                  toEmail: toEmail.trim(),
                  subject,
                  message,
                  artifact: resolved,
                });
                setOk(res.message);
              } catch (err) {
                const { messageFromUnknown } = await import(
                  "@/lib/action-error"
                );
                setError(messageFromUnknown(err, "Send failed"));
              }
            });
          }}
        >
          {pending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          className="btn btn-secondary text-xs"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

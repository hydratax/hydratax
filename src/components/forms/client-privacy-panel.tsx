"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  eraseClientData,
  exportClientData,
  getClientErasurePreview,
} from "@/server/actions/privacy";
import { downloadJson } from "@/lib/download-json";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type Hold = { kind: string; count: number; description: string };

/**
 * Processor tooling (UK GDPR Art 15/17/20 assistance for the practice):
 * export a client's data, or permanently erase it behind a confirmation step.
 * Replaces the old one-click "Remove client" button.
 */
export function ClientPrivacyPanel({
  clientId,
  clientName,
  canManage,
}: {
  clientId: string;
  clientName: string;
  /** Owner / admin with full access. Others see an explanation only. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "confirm">("idle");
  const [holds, setHolds] = useState<Hold[]>([]);
  const [phrase, setPhrase] = useState("");
  const [typedName, setTypedName] = useState("");
  const [ack, setAck] = useState(false);

  const hasHolds = holds.some((h) => h.count > 0);

  if (!canManage) {
    return (
      <div className="panel p-5">
        <h2 className="display text-2xl text-ink">Client data (GDPR)</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Only the practice owner or a full-access administrator can export or
          erase this client&apos;s data.
        </p>
      </div>
    );
  }

  return (
    <div className="panel border-danger/25 space-y-4 p-5">
      <div>
        <h2 className="display text-2xl text-ink">Client data (GDPR)</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Your practice is the controller of{" "}
          <span className="font-medium text-ink">{clientName}</span>&apos;s data;
          HydraTax is your processor. Export a copy to answer an access or
          portability request, or erase the client when you no longer need to
          keep it.
        </p>
      </div>

      <FormErrorBanner error={error} />
      {notice ? <p className="text-sm text-ink-soft">{notice}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            setNotice(null);
            start(async () => {
              const res = await exportClientData(clientId);
              if (!res.ok) return setError(res.error);
              downloadJson(res.filename, res.json);
              setNotice("Export downloaded. Keep it secure — it contains personal data.");
            });
          }}
        >
          {pending && step === "idle" ? "Preparing…" : "Export client data (JSON)"}
        </button>

        {step === "idle" ? (
          <button
            type="button"
            className="btn btn-secondary border-danger/40 text-danger hover:border-danger/60 hover:bg-danger/5"
            disabled={pending}
            onClick={() => {
              setError(null);
              setNotice(null);
              start(async () => {
                const res = await getClientErasurePreview(clientId);
                if (!res.ok) return setError(res.error);
                setHolds(res.holds);
                setStep("confirm");
              });
            }}
          >
            Erase client data…
          </button>
        ) : null}
      </div>

      {step === "confirm" ? (
        <form
          className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const res = await eraseClientData({
                clientId,
                confirmPhrase: phrase,
                confirmClientName: typedName,
                acknowledgeStatutory: ack,
              });
              if (!res.ok) return setError(res.error);
              router.push("/clients");
              router.refresh();
            });
          }}
        >
          <p className="text-sm font-semibold text-danger">
            This permanently erases {clientName} and all workspace data (books,
            bank, payroll, documents, filings). It cannot be undone.
          </p>
          <p className="text-sm text-ink-soft">
            Export the data first if you may need it. A pseudonymous audit
            trail of filings is retained by HydraTax as required by our
            retention policy.
          </p>
          {hasHolds ? (
            <div className="text-sm text-ink-soft">
              <p className="font-medium text-ink">
                Statutory records exist for this client:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {holds
                  .filter((h) => h.count > 0)
                  .map((h) => (
                    <li key={h.kind}>
                      {h.count} × {h.description}
                    </li>
                  ))}
              </ul>
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                <span>
                  I have exported what my practice must keep and am not relying
                  on HydraTax to retain these records.
                </span>
              </label>
            </div>
          ) : null}
          <label className="block text-sm">
            <span className="text-ink-soft">
              Type the client name <strong>{clientName}</strong>
            </span>
            <input
              className="input mt-1 w-full"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-soft">
              Type <strong>ERASE CLIENT DATA</strong> to confirm
            </span>
            <input
              className="input mt-1 w-full"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="submit"
              className="btn btn-secondary border-danger/40 text-danger hover:border-danger/60 hover:bg-danger/5"
              disabled={pending}
            >
              {pending ? "Erasing…" : "Permanently erase"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => {
                setStep("idle");
                setPhrase("");
                setTypedName("");
                setAck(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

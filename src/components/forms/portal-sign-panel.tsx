"use client";

import { useState, useTransition } from "react";
import {
  completePortalSignRequest,
} from "@/server/actions/desk";
import type { PortalSignRequest } from "@/lib/desk-profile";
import { SignaturePad } from "@/components/forms/signature-pad";

function canOpen(url?: string) {
  return Boolean(
    url &&
      (url.startsWith("http") ||
        url.startsWith("/") ||
        url.startsWith("data:")),
  );
}

export function PortalSignPanel({
  token,
  initial,
}: {
  token: string;
  initial: PortalSignRequest[];
}) {
  const [requests, setRequests] = useState(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const open = requests.filter((r) => r.status === "pending");
  const closed = requests.filter((r) => r.status !== "pending");

  if (requests.length === 0) return null;

  return (
    <section className="space-y-4 rounded-xl border border-sea/30 bg-sea/5 p-5">
      <div>
        <h2 className="text-lg font-semibold">Letter of engagement</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Review each document, type your name, and sign. Your accountant keeps
          a record of the signature on your client file.
        </p>
      </div>

      {open.map((req) => (
        <SignCard
          key={req.id}
          token={token}
          request={req}
          pending={pending}
          onDone={(next) => {
            setRequests((prev) =>
              prev.map((r) => (r.id === next.id ? next : r)),
            );
            setMessage(
              next.status === "signed"
                ? `Signed: ${next.title}`
                : `Declined: ${next.title}`,
            );
          }}
          onError={setMessage}
          start={start}
        />
      ))}

      {closed.length > 0 && (
        <ul className="space-y-1 text-sm text-ink-soft">
          {closed.map((r) => (
            <li key={r.id}>
              {r.status === "signed" ? "Signed" : "Declined"} — {r.title}
              {r.signedAt
                ? ` · ${new Date(r.signedAt).toLocaleString("en-GB")}`
                : r.declinedAt
                  ? ` · ${new Date(r.declinedAt).toLocaleString("en-GB")}`
                  : ""}
            </li>
          ))}
        </ul>
      )}
      {message ? <p className="text-sm">{message}</p> : null}
    </section>
  );
}

function SignCard({
  token,
  request,
  pending,
  onDone,
  onError,
  start,
}: {
  token: string;
  request: PortalSignRequest;
  pending: boolean;
  onDone: (next: PortalSignRequest) => void;
  onError: (msg: string) => void;
  start: (fn: () => void) => void;
}) {
  const [typedName, setTypedName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-lg border border-line bg-white/80 p-4">
      <p className="font-semibold text-ink">{request.title}</p>
      {request.message ? (
        <p className="text-sm text-ink-soft">{request.message}</p>
      ) : null}
      <p className="text-xs text-ink-soft">
        Requested {new Date(request.createdAt).toLocaleString("en-GB")}
      </p>
      {canOpen(request.documentUrl) ? (
        <a
          href={request.documentUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-secondary text-sm"
        >
          Open {request.filename ?? "document"}
        </a>
      ) : null}

      <label className="block space-y-1">
        <span className="label">Full name</span>
        <input
          className="input"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          placeholder="Type your full name"
          autoComplete="name"
        />
      </label>

      <SignaturePad onChange={setSignatureDataUrl} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            onError("");
            start(async () => {
              const result = await completePortalSignRequest({
                token,
                signRequestId: request.id,
                typedName,
                signatureDataUrl: signatureDataUrl ?? undefined,
              });
              if (!result.ok) {
                onError(result.error);
                return;
              }
              onDone(result.request);
            });
          }}
        >
          {pending ? "Saving…" : "Sign"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => {
            onError("");
            start(async () => {
              const result = await completePortalSignRequest({
                token,
                signRequestId: request.id,
                typedName,
                decline: true,
              });
              if (!result.ok) {
                onError(result.error);
                return;
              }
              onDone(result.request);
            });
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

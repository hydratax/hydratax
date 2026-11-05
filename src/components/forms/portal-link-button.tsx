"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ensurePortal,
  sendPortalApprovalPack,
} from "@/server/actions/desk";
import type { PortalRecord } from "@/lib/desk-profile";
import { messageFromUnknown } from "@/lib/action-error";

type DocOption = { id: string; filename: string };

export function PortalLinkButton({
  clientId,
  clientSlug,
  initial,
  documents,
}: {
  clientId: string;
  clientSlug: string;
  initial: PortalRecord | null;
  documents: DocOption[];
}) {
  const [portal, setPortal] = useState(initial);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<"accounts" | "ct600" | "vat">("accounts");
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = portal ? `${origin}/portal/${portal.token}` : "";

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-5">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            setError("");
            start(async () => {
              try {
                const next = await ensurePortal(clientId);
                setPortal(next);
                setMsg("Client link is ready.");
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not create link",
                );
              }
            });
          }}
        >
          {portal ? "Client link is active" : "Create client link"}
        </button>
        {link && (
          <p className="break-all text-sm">
            <a className="font-semibold text-sea" href={link} target="_blank" rel="noreferrer">
              {link}
            </a>
          </p>
        )}
        <p className="text-sm text-ink-soft">
          Clients use this page to upload bank statements and other papers, and
          to approve accounts / CT600 / VAT. For structured onboarding with a
          custom form, use the{" "}
          <Link
            href={`/clients/${clientSlug}/forms`}
            className="font-semibold text-sea"
          >
            Forms
          </Link>{" "}
          tab.
        </p>
        {portal && (
          <ul className="text-sm text-ink-soft">
            {portal.requests.map((r) => (
              <li key={r.id}>
                {r.done ? "Received" : "Waiting"} — {r.label}
              </li>
            ))}
            <li>
              Accounts approval: {portal.approveAccounts ? "yes" : "no"} · CT600:{" "}
              {portal.approveCt600 ? "yes" : "no"} · VAT:{" "}
              {portal.approveVat ? "yes" : "no"}
            </li>
            {(portal.uploads ?? []).map((u) => (
              <li key={`${u.documentId}-${u.uploadedAt}`}>
                Uploaded — {u.filename}
                {u.requestId ? ` (${u.requestId})` : ""}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        {msg && <p className="text-sm text-ok">{msg}</p>}
      </div>

      <div className="panel space-y-3 p-5">
        <h2 className="display text-xl text-ink">Send draft for approval</h2>
        <p className="text-sm text-ink-soft">
          Attach a document from this client’s file (accounts pack PDF, CT600
          computation, VAT draft). It appears on their client link above the
          approval tick boxes.
        </p>
        <label className="block space-y-1">
          <span className="label">Filing</span>
          <select
            className="input"
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as "accounts" | "ct600" | "vat")
            }
          >
            <option value="accounts">Annual accounts</option>
            <option value="ct600">Company Tax Return</option>
            <option value="vat">VAT return</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="label">Document on file</span>
          <select
            className="input"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
          >
            <option value="">Message only (no attachment)</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="label">Note to client (optional)</span>
          <textarea
            className="input min-h-[4rem]"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Please review and approve so we can file."
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !portal}
          onClick={() => {
            setError("");
            start(async () => {
              try {
                if (!portal) {
                  await ensurePortal(clientId);
                }
                const next = await sendPortalApprovalPack({
                  clientId,
                  kind,
                  documentId: documentId || undefined,
                  message: message || undefined,
                });
                setPortal(next);
                setMsg(
                  `Sent ${kind} for approval — client can open it on their link.`,
                );
              } catch (err) {
                setError(messageFromUnknown(err, "Could not send for approval"));
              }
            });
          }}
        >
          Send to client for approval
        </button>
        {portal?.approvalPacks && (
          <ul className="text-sm text-ink-soft">
            {portal.approvalPacks.accounts && (
              <li>
                Accounts pack sent{" "}
                {new Date(portal.approvalPacks.accounts.sentAt).toLocaleString(
                  "en-GB",
                )}
                {portal.approvalPacks.accounts.filename
                  ? ` — ${portal.approvalPacks.accounts.filename}`
                  : ""}
              </li>
            )}
            {portal.approvalPacks.ct600 && (
              <li>
                CT600 sent{" "}
                {new Date(portal.approvalPacks.ct600.sentAt).toLocaleString(
                  "en-GB",
                )}
              </li>
            )}
            {portal.approvalPacks.vat && (
              <li>
                VAT sent{" "}
                {new Date(portal.approvalPacks.vat.sentAt).toLocaleString(
                  "en-GB",
                )}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

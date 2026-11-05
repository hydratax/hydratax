"use client";

import { useState, useTransition } from "react";
import { ensurePortal } from "@/server/actions/desk";
import type { PortalRecord } from "@/lib/desk-profile";

export function PortalLinkButton({
  clientId,
  initial,
}: {
  clientId: string;
  initial: PortalRecord | null;
}) {
  const [portal, setPortal] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = portal ? `${origin}/portal/${portal.token}` : "";

  return (
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
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create link");
            }
          });
        }}
      >
        {portal ? "Client link is active" : "Create client link"}
      </button>
      {link && (
        <p className="break-all text-sm">
          <a className="font-semibold text-sea" href={link}>
            {link}
          </a>
        </p>
      )}
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
            <li key={`${u.documentId}-${u.uploadedAt}`}>Uploaded — {u.filename}</li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

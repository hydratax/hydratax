"use client";

import { useState, useTransition } from "react";
import { updatePortalFromClient, uploadPortalPaper } from "@/server/actions/desk";
import type { PortalRecord } from "@/lib/desk-profile";
import { PortalSignPanel } from "@/components/forms/portal-sign-panel";

function canOpen(url?: string) {
  return Boolean(
    url &&
      (url.startsWith("http") ||
        url.startsWith("/") ||
        url.startsWith("data:")),
  );
}

export function ClientPortalForm({
  token,
  portal,
  clientName,
}: {
  token: string;
  portal: PortalRecord;
  clientName: string;
}) {
  const [requests, setRequests] = useState(portal.requests);
  const [approveAccounts, setApproveAccounts] = useState(portal.approveAccounts);
  const [approveCt600, setApproveCt600] = useState(portal.approveCt600);
  const [approveVat, setApproveVat] = useState(portal.approveVat);
  const [uploads, setUploads] = useState(portal.uploads ?? []);
  const [uploadKind, setUploadKind] = useState(
    portal.requests[0]?.id ?? "bank",
  );
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const packs = portal.approvalPacks ?? {};

  return (
    <div className="space-y-8">
      <PortalSignPanel token={token} initial={portal.signRequests ?? []} />

      {(packs.accounts || packs.ct600 || packs.vat) && (
        <section className="space-y-4 rounded-xl border border-sea/30 bg-sea/5 p-5">
          <h2 className="text-lg font-semibold">Drafts to review</h2>
          <p className="text-sm text-ink-soft">
            Your accountant has shared the following for {clientName}. Open the
            file, then approve below when you are happy.
          </p>
          {(["accounts", "ct600", "vat"] as const).map((kind) => {
            const pack = packs[kind];
            if (!pack) return null;
            return (
              <div
                key={kind}
                className="rounded-lg border border-line bg-white/80 p-4"
              >
                <p className="font-semibold text-ink">{pack.title}</p>
                {pack.message ? (
                  <p className="mt-1 text-sm text-ink-soft">{pack.message}</p>
                ) : null}
                <p className="mt-1 text-xs text-ink-soft">
                  Sent {new Date(pack.sentAt).toLocaleString("en-GB")}
                </p>
                {canOpen(pack.documentUrl) ? (
                  <a
                    href={pack.documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary mt-3 text-sm"
                  >
                    Open {pack.filename ?? "document"}
                  </a>
                ) : (
                  <p className="mt-2 text-sm text-ink-soft">
                    Ask your accountant if you need the document emailed as well.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      <form
        className="space-y-3 rounded-xl border border-line bg-white/80 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          data.set("token", token);
          if (uploadKind && uploadKind !== "other") {
            data.set("requestId", uploadKind);
          }
          start(async () => {
            const result = await uploadPortalPaper(data);
            if (!result.ok) {
              setMessage(result.error);
              return;
            }
            setUploads((prev) => [
              ...prev,
              {
                filename: result.filename,
                documentId: result.documentId,
                uploadedAt: new Date().toISOString(),
                requestId: result.requestId ?? undefined,
              },
            ]);
            if (result.requestId) {
              setRequests((prev) =>
                prev.map((r) =>
                  r.id === result.requestId ? { ...r, done: true } : r,
                ),
              );
            }
            setMessage(`${result.filename} is on your client file.`);
            form.reset();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Upload papers</h2>
        <p className="text-sm text-ink-soft">
          Choose what you are sending, then attach the file. Bank statements,
          invoices and payroll papers are stored on your accountant’s file for
          this client.
        </p>
        <label className="block space-y-1">
          <span className="label">What is this file?</span>
          <select
            className="input"
            value={uploadKind}
            onChange={(e) => setUploadKind(e.target.value)}
          >
            {requests.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
            <option value="other">Other document</option>
          </select>
        </label>
        <input
          className="block w-full text-sm"
          type="file"
          name="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx"
          required
        />
        <button className="btn btn-secondary" disabled={pending} type="submit">
          {pending ? "Uploading…" : "Upload to my accountant"}
        </button>
        {uploads.length > 0 && (
          <ul className="space-y-1 text-sm text-ink-soft">
            {uploads.map((u) => (
              <li key={`${u.filename}-${u.uploadedAt}`}>
                {u.filename}
                {u.requestId ? ` · ${u.requestId}` : ""}
              </li>
            ))}
          </ul>
        )}
      </form>

      <form
        className="space-y-6 rounded-xl border border-line bg-white/80 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const result = await updatePortalFromClient({
              token,
              requests: requests.map((r) => ({ id: r.id, done: r.done })),
              approveAccounts,
              approveCt600,
              approveVat,
            });
            setMessage(
              result.ok ? "Saved. Your accountant can see this." : result.error,
            );
          });
        }}
      >
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Checklist</h2>
          <p className="text-sm text-ink-soft">
            Uploading a file for an item marks it received. You can also tick
            manually.
          </p>
          {requests.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={r.done}
                onChange={(e) => {
                  const done = e.target.checked;
                  setRequests((prev) =>
                    prev.map((item) =>
                      item.id === r.id ? { ...item, done } : item,
                    ),
                  );
                }}
              />
              {r.label}
            </label>
          ))}
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Approval for {clientName}</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={approveAccounts}
              onChange={(e) => setApproveAccounts(e.target.checked)}
            />
            I approve the annual accounts for filing
            {packs.accounts ? " (see draft above)" : ""}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={approveCt600}
              onChange={(e) => setApproveCt600(e.target.checked)}
            />
            I approve the Company Tax Return
            {packs.ct600 ? " (see draft above)" : ""}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={approveVat}
              onChange={(e) => setApproveVat(e.target.checked)}
            />
            I approve the VAT return
            {packs.vat ? " (see draft above)" : ""}
          </label>
        </section>
        <button className="btn btn-primary" disabled={pending} type="submit">
          {pending ? "Saving…" : "Send approval"}
        </button>
        {message && <p className="text-sm">{message}</p>}
      </form>
    </div>
  );
}

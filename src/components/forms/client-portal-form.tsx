"use client";

import { useState, useTransition } from "react";
import { updatePortalFromClient, uploadPortalPaper } from "@/server/actions/desk";
import type { PortalRecord } from "@/lib/desk-profile";

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
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          data.set("token", token);
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
                documentId: "",
                uploadedAt: new Date().toISOString(),
              },
            ]);
            setMessage(`${result.filename} is with your accountant.`);
            form.reset();
          });
        }}
      >
        <h2 className="text-lg font-semibold">Upload papers</h2>
        <input
          className="block w-full text-sm"
          type="file"
          name="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx"
          required
        />
        <button className="btn btn-secondary" disabled={pending} type="submit">
          {pending ? "Uploading…" : "Upload"}
        </button>
        {uploads.length > 0 && (
          <ul className="text-sm text-ink-soft">
            {uploads.map((u) => (
              <li key={`${u.filename}-${u.uploadedAt}`}>{u.filename}</li>
            ))}
          </ul>
        )}
      </form>

      <form
        className="space-y-6"
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
          <h2 className="text-lg font-semibold">Papers you have sent</h2>
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
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={approveCt600}
              onChange={(e) => setApproveCt600(e.target.checked)}
            />
            I approve the Company Tax Return
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={approveVat}
              onChange={(e) => setApproveVat(e.target.checked)}
            />
            I approve the VAT return
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

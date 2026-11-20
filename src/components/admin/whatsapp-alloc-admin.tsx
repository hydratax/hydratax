"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminAssignWhatsAppAllocation,
  type WhatsAppAllocation,
} from "@/server/actions/whatsapp-desk";

export function WhatsAppAllocAdmin({
  initial,
  practices,
  platformReady,
}: {
  initial: WhatsAppAllocation[];
  practices: Array<{ id: string; name: string }>;
  platformReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [practiceId, setPracticeId] = useState(practices[0]?.id ?? "");
  const [enabled, setEnabled] = useState(true);
  const [messages, setMessages] = useState(200);
  const [documents, setDocuments] = useState(50);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [rotateKey, setRotateKey] = useState(true);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const byId = useMemo(() => {
    const m = new Map(initial.map((a) => [a.practiceId, a]));
    return m;
  }, [initial]);

  function loadPractice(id: string) {
    setPracticeId(id);
    const hit = byId.get(id);
    if (!hit) {
      setEnabled(true);
      setMessages(200);
      setDocuments(50);
      setLabel("");
      setNotes("");
      setRotateKey(true);
      return;
    }
    setEnabled(hit.enabled);
    setMessages(hit.monthlyMessageLimit);
    setDocuments(hit.monthlyDocumentLimit);
    setLabel(hit.label ?? "");
    setNotes(hit.notes ?? "");
    setRotateKey(false);
  }

  return (
    <div className="space-y-8">
      {!platformReady ? (
        <p className="rounded-lg border border-line bg-sand/40 px-4 py-3 text-sm text-ink">
          Platform WhatsApp is not configured yet. Add the Meta credentials on
          Netlify (see docs/whatsapp-shared-pipeline.md in the repo).
        </p>
      ) : (
        <p className="text-sm text-ink-soft">
          Shared HydraTax WhatsApp number is ready. Assign monthly volume to
          each practice — accountants send from the desk without linking their
          own WhatsApp.
        </p>
      )}

      <form
        className="panel space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!practiceId) return;
          setIssuedKey(null);
          start(async () => {
            try {
              const res = await adminAssignWhatsAppAllocation({
                practiceId,
                enabled,
                monthlyMessageLimit: messages,
                monthlyDocumentLimit: documents,
                label: label || null,
                notes: notes || null,
                rotateApiKey: rotateKey,
              });
              if (res.apiKeyPlaintext) setIssuedKey(res.apiKeyPlaintext);
              router.refresh();
            } catch {
              /* freeze */
            }
          });
        }}
      >
        <h2 className="display text-2xl text-ink">Assign practice volume</h2>
        <label className="block text-sm font-semibold">
          Practice
          <select
            className="input mt-1.5"
            value={practiceId}
            onChange={(e) => loadPractice(e.target.value)}
          >
            {practices.length === 0 ? (
              <option value="">No practices</option>
            ) : null}
            {practices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Messages / month
            <input
              className="input mt-1.5"
              type="number"
              min={0}
              value={messages}
              onChange={(e) => setMessages(Number(e.target.value) || 0)}
            />
          </label>
          <label className="block text-sm font-semibold">
            Documents / month
            <input
              className="input mt-1.5"
              type="number"
              min={0}
              value={documents}
              onChange={(e) => setDocuments(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        <label className="block text-sm font-semibold">
          Label
          <input
            className="input mt-1.5"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Starter plan"
          />
        </label>
        <label className="block text-sm font-semibold">
          Notes
          <textarea
            className="input mt-1.5 min-h-[4rem]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={rotateKey}
            onChange={(e) => setRotateKey(e.target.checked)}
          />
          Issue / rotate practice credential key
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending || !practiceId}
        >
          {pending ? "Saving…" : "Save allocation"}
        </button>
        {issuedKey ? (
          <div className="rounded-lg border border-sea/30 bg-sea/5 px-3 py-2 text-sm">
            <p className="font-semibold text-ink">Practice credential (copy now)</p>
            <code className="mt-1 block break-all text-sea">{issuedKey}</code>
            <p className="mt-1 text-xs text-ink-soft">
              Shown once. Desk login is enough to send; this key is for
              bookkeeping / future API use.
            </p>
          </div>
        ) : null}
      </form>

      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-sand/40 text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-semibold">Practice</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Messages</th>
              <th className="px-3 py-2 font-semibold">Documents</th>
              <th className="px-3 py-2 font-semibold">Key</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((a) => (
              <tr key={a.practiceId} className="border-b border-line/60">
                <td className="px-3 py-2.5 font-semibold text-ink">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => loadPractice(a.practiceId)}
                  >
                    {a.practiceName || a.practiceId.slice(0, 8)}
                  </button>
                  {a.label ? (
                    <span className="mt-0.5 block text-xs font-normal text-ink-soft">
                      {a.label}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  {a.enabled ? "Enabled" : "Off"}
                </td>
                <td className="px-3 py-2.5 paye-digits">
                  {a.usedMessages}/{a.monthlyMessageLimit}
                </td>
                <td className="px-3 py-2.5 paye-digits">
                  {a.usedDocuments}/{a.monthlyDocumentLimit}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-ink-soft">
                  {a.apiKeyPrefix ? `${a.apiKeyPrefix}…` : "—"}
                </td>
              </tr>
            ))}
            {initial.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-ink-soft"
                >
                  No allocations yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

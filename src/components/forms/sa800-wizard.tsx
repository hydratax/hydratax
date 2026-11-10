"use client";

import { useState, useTransition } from "react";
import {
  emptySa800Draft,
  type Sa800Draft,
  type Sa800Partner,
} from "@/lib/sa800/schema";
import { calculateSa800 } from "@/lib/sa800/calculate";
import {
  saveSa800Draft,
  submitSa800Draft,
  type Sa800Stored,
} from "@/server/actions/sa800";
import { messageFromUnknown } from "@/lib/action-error";

function moneyInput(n: number) {
  return n ? String(n) : "";
}

function parseMoney(s: string) {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function Sa800Wizard({
  clientId,
  clientName,
  initial,
  taxYear,
}: {
  clientId: string;
  clientName: string;
  initial: Sa800Stored | null;
  taxYear: string;
}) {
  const [draft, setDraft] = useState<Sa800Draft>(
    () =>
      initial?.draft ??
      emptySa800Draft({
        taxYear,
        partnershipName: clientName,
      }),
  );
  const [saved, setSaved] = useState<Sa800Stored | null>(initial);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const calc = calculateSa800(draft);

  function patch<K extends keyof Sa800Draft>(key: K, value: Sa800Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function patchPartner(id: string, patchFields: Partial<Sa800Partner>) {
    setDraft((d) => ({
      ...d,
      partners: d.partners.map((p) =>
        p.id === id ? { ...p, ...patchFields } : p,
      ),
    }));
  }

  return (
    <div className="space-y-6">
      <section className="panel space-y-3 p-5">
        <h2 className="display text-xl text-ink">Partnership details</h2>
        <p className="text-sm text-ink-soft">
          Tax year {draft.taxYear}. This desk prepares a practice SA800 working
          paper and partner profit shares. Live HMRC partnership filing is not
          enabled yet.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="label">Partnership name</span>
            <input
              className="input"
              value={draft.partnershipName}
              onChange={(e) => patch("partnershipName", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Partnership UTR</span>
            <input
              className="input"
              value={draft.partnershipUtr}
              onChange={(e) => patch("partnershipUtr", e.target.value)}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="label">Trade description</span>
            <input
              className="input"
              value={draft.tradeDescription}
              onChange={(e) => patch("tradeDescription", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Accounts from</span>
            <input
              className="input"
              type="date"
              value={draft.booksFrom}
              onChange={(e) => patch("booksFrom", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Accounts to</span>
            <input
              className="input"
              type="date"
              value={draft.booksTo}
              onChange={(e) => patch("booksTo", e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="display text-xl text-ink">Income and expenses</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["turnover", "Turnover"],
              ["otherIncome", "Other income"],
              ["costOfGoods", "Cost of goods"],
              ["staffCosts", "Staff costs"],
              ["premisesCosts", "Premises costs"],
              ["otherExpenses", "Other expenses"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1">
              <span className="label">{label} (£)</span>
              <input
                className="input text-right tabular-nums"
                inputMode="decimal"
                value={moneyInput(draft[key])}
                onChange={(e) => patch(key, parseMoney(e.target.value))}
              />
            </label>
          ))}
        </div>
        <p className="text-sm font-semibold text-ink">
          Profit for allocation:{" "}
          {new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
          }).format(calc.profitBeforeAllocation)}
        </p>
      </section>

      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-xl text-ink">Partners</h2>
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                partners: [
                  ...d.partners,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    nino: "",
                    sharePct: 0,
                  },
                ],
              }))
            }
          >
            Add partner
          </button>
        </div>
        <p className="text-sm text-ink-soft">
          Shares total {calc.sharePctTotal.toFixed(1)}%
          {calc.sharePctBalanced ? " · balanced" : " · must equal 100%"}
        </p>
        <div className="space-y-3">
          {draft.partners.map((p) => (
            <div
              key={p.id}
              className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-4"
            >
              <label className="block space-y-1 sm:col-span-2">
                <span className="label">Name</span>
                <input
                  className="input"
                  value={p.name}
                  onChange={(e) => patchPartner(p.id, { name: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="label">NINO</span>
                <input
                  className="input"
                  value={p.nino}
                  onChange={(e) => patchPartner(p.id, { nino: e.target.value })}
                />
              </label>
              <label className="block space-y-1">
                <span className="label">Share %</span>
                <input
                  className="input text-right"
                  inputMode="decimal"
                  value={p.sharePct || ""}
                  onChange={(e) =>
                    patchPartner(p.id, {
                      sharePct: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <p className="text-sm text-ink-soft sm:col-span-4">
                Profit share{" "}
                {new Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency: "GBP",
                }).format(
                  calc.partnerShares.find((x) => x.id === p.id)?.profitShare ??
                    0,
                )}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel space-y-3 p-5">
        <h2 className="display text-xl text-ink">Declaration</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="label">Name</span>
            <input
              className="input"
              value={draft.declarationName}
              onChange={(e) => patch("declarationName", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Capacity</span>
            <input
              className="input"
              value={draft.declarationCapacity}
              onChange={(e) => patch("declarationCapacity", e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => {
              setError("");
              start(async () => {
                try {
                  const row = await saveSa800Draft({ clientId, draft });
                  setSaved(row);
                  setMsg("Draft saved.");
                } catch (err) {
                  setError(messageFromUnknown(err, "Could not save draft"));
                }
              });
            }}
          >
            {pending ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || !saved}
            onClick={() => {
              setError("");
              start(async () => {
                try {
                  const row = await saveSa800Draft({ clientId, draft });
                  const submitted = await submitSa800Draft({
                    clientId,
                    taxYear: row.taxYear,
                  });
                  setSaved(submitted);
                  setMsg(
                    "Marked accepted in demo. Download the summary PDF for the file.",
                  );
                } catch (err) {
                  setError(messageFromUnknown(err, "Could not submit"));
                }
              });
            }}
          >
            Accept (demo)
          </button>
          {saved ? (
            <a
              className="btn btn-secondary"
              href={`/api/clients/${clientId}/sa800/${saved.id}/summary`}
              target="_blank"
              rel="noreferrer"
            >
              Download summary PDF
            </a>
          ) : null}
        </div>
        {saved ? (
          <p className="text-sm text-ink-soft">
            Status: {saved.status}
            {saved.submittedAt
              ? ` · ${new Date(saved.submittedAt).toLocaleString("en-GB")}`
              : ""}
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {msg ? <p className="text-sm text-ok">{msg}</p> : null}
      </section>
    </div>
  );
}

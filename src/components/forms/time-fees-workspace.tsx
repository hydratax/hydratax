"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  billTimeEntries,
  createTimeEntry,
  writeOffTimeEntries,
} from "@/server/actions/time-fees";
import type { MemoryTimeEntry } from "@/server/demo/store";
import { messageFromUnknown } from "@/lib/action-error";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function hoursLabel(minutes: number) {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(2);
}

function formatPounds(pence: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function rateLabel(pencePerHour: number) {
  return (pencePerHour / 100).toFixed(2);
}

export function TimeFeesWorkspace({
  clientId,
  clientSlug,
  clientName,
  initial,
}: {
  clientId: string;
  clientSlug: string;
  clientName: string;
  initial: MemoryTimeEntry[];
}) {
  const [entries, setEntries] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [workDate, setWorkDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("1");
  const [ratePounds, setRatePounds] = useState("100.00");
  const [staffName, setStaffName] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const wip = useMemo(
    () => entries.filter((e) => e.status === "wip"),
    [entries],
  );
  const wipTotal = wip.reduce((s, e) => s + e.amountPence, 0);
  const selectedWip = wip.filter((e) => selected.includes(e.id));
  const selectedTotal = selectedWip.reduce((s, e) => s + e.amountPence, 0);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAllWip() {
    if (selected.length === wip.length) {
      setSelected([]);
      return;
    }
    setSelected(wip.map((e) => e.id));
  }

  return (
    <div className="space-y-6">
      <div className="panel space-y-3 p-5">
        <h2 className="display text-xl text-ink">Log time</h2>
        <p className="text-sm text-ink-soft">
          Record billable work for {clientName}. Open WIP can be raised as a
          client invoice without leaving the desk.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block space-y-1">
            <span className="label">Date</span>
            <input
              className="input"
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Hours</span>
            <input
              className="input"
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="1.5"
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Rate (£ / hour)</span>
            <input
              className="input"
              inputMode="decimal"
              value={ratePounds}
              onChange={(e) => setRatePounds(e.target.value)}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="label">Description</span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Year-end accounts prep"
            />
          </label>
          <label className="block space-y-1">
            <span className="label">Staff (optional)</span>
            <input
              className="input"
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              placeholder="Your name"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => {
            setError("");
            start(async () => {
              try {
                const entry = await createTimeEntry({
                  clientId,
                  workDate,
                  description,
                  hours: Number(hours),
                  ratePounds,
                  staffName: staffName || undefined,
                });
                setEntries((prev) => [entry, ...prev]);
                setDescription("");
                setMsg("Time logged to WIP.");
              } catch (err) {
                setError(messageFromUnknown(err, "Could not log time"));
              }
            });
          }}
        >
          {pending ? "Saving…" : "Add to WIP"}
        </button>
      </div>

      <div className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display text-xl text-ink">WIP</h2>
            <p className="text-sm text-ink-soft">
              Open balance {formatPounds(wipTotal)}
              {selectedWip.length > 0
                ? ` · selected ${formatPounds(selectedTotal)}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              disabled={pending || selectedWip.length === 0}
              onClick={() => {
                setError("");
                start(async () => {
                  try {
                    await writeOffTimeEntries({
                      clientId,
                      entryIds: selectedWip.map((e) => e.id),
                    });
                    setEntries((prev) =>
                      prev.map((e) =>
                        selected.includes(e.id) && e.status === "wip"
                          ? { ...e, status: "written_off" }
                          : e,
                      ),
                    );
                    setSelected([]);
                    setMsg("Selected WIP written off.");
                  } catch (err) {
                    setError(messageFromUnknown(err, "Could not write off"));
                  }
                });
              }}
            >
              Write off
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={pending || selectedWip.length === 0}
              onClick={() => {
                setError("");
                start(async () => {
                  try {
                    const invoice = await billTimeEntries({
                      clientId,
                      entryIds: selectedWip.map((e) => e.id),
                    });
                    setEntries((prev) =>
                      prev.map((e) =>
                        selected.includes(e.id) && e.status === "wip"
                          ? {
                              ...e,
                              status: "billed",
                              invoiceId: invoice.id,
                            }
                          : e,
                      ),
                    );
                    setSelected([]);
                    setMsg(
                      `Invoice ${invoice.invoiceNumber} raised — open Invoices to print or send.`,
                    );
                  } catch (err) {
                    setError(messageFromUnknown(err, "Could not raise invoice"));
                  }
                });
              }}
            >
              Raise invoice
            </button>
            <Link
              href={`/clients/${clientSlug}/invoices`}
              className="btn btn-secondary text-sm"
            >
              Invoices
            </Link>
          </div>
        </div>

        {wip.length === 0 ? (
          <p className="text-sm text-ink-soft">No open WIP for this client.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-soft">
                  <th className="py-2 pr-2 font-medium">
                    <input
                      type="checkbox"
                      checked={
                        wip.length > 0 && selected.length === wip.length
                      }
                      onChange={toggleAllWip}
                      aria-label="Select all WIP"
                    />
                  </th>
                  <th className="py-2 pr-2 font-medium">Date</th>
                  <th className="py-2 pr-2 font-medium">Description</th>
                  <th className="py-2 pr-2 font-medium">Staff</th>
                  <th className="py-2 pr-2 text-right font-medium">Hours</th>
                  <th className="py-2 pr-2 text-right font-medium">Rate</th>
                  <th className="py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {wip.map((e) => (
                  <tr key={e.id} className="border-b border-line/60">
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(e.id)}
                        onChange={() => toggle(e.id)}
                        aria-label={`Select ${e.description}`}
                      />
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{e.workDate}</td>
                    <td className="py-2 pr-2">{e.description}</td>
                    <td className="py-2 pr-2 text-ink-soft">
                      {e.staffName ?? "—"}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {hoursLabel(e.minutes)}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      £{rateLabel(e.ratePencePerHour)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">
                      {formatPounds(e.amountPence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {entries.some((e) => e.status !== "wip") && (
        <div className="panel space-y-2 p-5">
          <h2 className="display text-xl text-ink">History</h2>
          <ul className="space-y-1 text-sm text-ink-soft">
            {entries
              .filter((e) => e.status !== "wip")
              .map((e) => (
                <li key={e.id}>
                  {e.status === "billed" ? "Billed" : "Written off"} ·{" "}
                  {e.workDate} · {e.description} ·{" "}
                  {formatPounds(e.amountPence)}
                </li>
              ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {msg && <p className="text-sm text-ok">{msg}</p>}
    </div>
  );
}

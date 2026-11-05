"use client";

import { useState, useTransition } from "react";
import { saveAmlRecord } from "@/server/actions/desk";
import type { AmlRecord, AmlRisk } from "@/lib/desk-profile";

export function AmlForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial: AmlRecord | null;
}) {
  const [risk, setRisk] = useState<AmlRisk>(initial?.risk ?? "medium");
  const [idVerifiedOn, setIdVerifiedOn] = useState(initial?.idVerifiedOn ?? "");
  const [nextReviewOn, setNextReviewOn] = useState(initial?.nextReviewOn ?? "");
  const [reviewer, setReviewer] = useState(initial?.reviewer ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage("");
        start(async () => {
          try {
            await saveAmlRecord({
              clientId,
              risk,
              idVerifiedOn,
              nextReviewOn,
              reviewer,
              notes,
            });
            setMessage("AML record saved on this client.");
          } catch (err) {
            setMessage(err instanceof Error ? err.message : "Could not save");
          }
        });
      }}
    >
      <label className="block text-sm font-semibold">
        Risk
        <select
          className="input mt-1"
          value={risk}
          onChange={(e) => setRisk(e.target.value as AmlRisk)}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Identity verified on
        <input
          className="input mt-1"
          type="date"
          value={idVerifiedOn}
          onChange={(e) => setIdVerifiedOn(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm font-semibold">
        Next review
        <input
          className="input mt-1"
          type="date"
          value={nextReviewOn}
          onChange={(e) => setNextReviewOn(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm font-semibold">
        Reviewer
        <input
          className="input mt-1"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          required
        />
      </label>
      <label className="block text-sm font-semibold">
        Evidence notes
        <textarea
          className="input mt-1 min-h-28"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="ID document type, source of funds, anything unusual."
        />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save AML record"}
      </button>
      {message && <p className="text-sm text-ink-soft">{message}</p>}
    </form>
  );
}

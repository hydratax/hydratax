"use client";

import { useState, useTransition } from "react";
import { seedPresentationDemoClients } from "@/server/actions/presentation-demo";
import { messageFromUnknown } from "@/lib/action-error";

export function SeedPresentationDemoButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() => {
          setErr("");
          setMsg("");
          start(async () => {
            try {
              const result = await seedPresentationDemoClients();
              setMsg(result.message);
            } catch (e) {
              setErr(messageFromUnknown(e, "Could not seed demo clients"));
            }
          });
        }}
      >
        {pending ? "Loading…" : "Load presentation clients"}
      </button>
      <p className="text-sm text-ink-soft">
        Loads a full fictional desk (directors, payroll, bank→VAT/accounts,
        CT600 ready drafts, emails) and hides real clients for this session.
        Exit sales demo restores them.
      </p>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
      {err ? <p className="text-sm text-danger">{err}</p> : null}
    </div>
  );
}

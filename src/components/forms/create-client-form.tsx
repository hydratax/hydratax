"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/server/actions/clients";

export function CreateClientForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"sole_trader" | "limited_company" | "partnership">(
    "limited_company",
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            const client = await createClient({
              name: String(fd.get("name") || ""),
              type,
              companyNumber: String(fd.get("companyNumber") || "") || undefined,
              utr: String(fd.get("utr") || "") || undefined,
              vrn: String(fd.get("vrn") || "") || undefined,
              nino: String(fd.get("nino") || "") || undefined,
              payeRef: String(fd.get("payeRef") || "") || undefined,
              accountsOfficeRef:
                String(fd.get("accountsOfficeRef") || "") || undefined,
              contactEmail: String(fd.get("contactEmail") || "") || undefined,
              isEmployer: fd.get("isEmployer") === "on",
              isVatRegistered: fd.get("isVatRegistered") === "on",
            });
            router.push(`/clients/${client.id}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create");
          }
        });
      }}
    >
      <div>
        <label className="label" htmlFor="name">
          Client name
        </label>
        <input id="name" name="name" className="input" required />
      </div>
      <div>
        <label className="label" htmlFor="type">
          Type
        </label>
        <select
          id="type"
          className="input"
          value={type}
          onChange={(e) =>
            setType(e.target.value as typeof type)
          }
        >
          <option value="limited_company">Limited company</option>
          <option value="sole_trader">Sole trader</option>
          <option value="partnership">Partnership</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="companyNumber">
            Company number
          </label>
          <input id="companyNumber" name="companyNumber" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="utr">
            UTR
          </label>
          <input id="utr" name="utr" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="vrn">
            VRN
          </label>
          <input id="vrn" name="vrn" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="nino">
            NINO
          </label>
          <input id="nino" name="nino" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="payeRef">
            PAYE ref
          </label>
          <input id="payeRef" name="payeRef" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="contactEmail">
            Client email
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            className="input"
            placeholder="client@example.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="accountsOfficeRef">
            Accounts Office ref
          </label>
          <input
            id="accountsOfficeRef"
            name="accountsOfficeRef"
            className="input"
          />
        </div>
      </div>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isVatRegistered" defaultChecked />
          VAT registered
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isEmployer" />
          Employer (PAYE)
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Create client"}
      </button>
    </form>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateClient } from "@/server/actions/clients";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

export type EditClientValues = {
  id: string;
  slug: string;
  name: string;
  type: "sole_trader" | "limited_company" | "partnership";
  companyNumber: string | null;
  companyAuthCode: string | null;
  utr: string | null;
  vrn: string | null;
  nino: string | null;
  payeRef: string | null;
  accountsOfficeRef: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isEmployer: boolean;
  isVatRegistered: boolean;
};

export function EditClientForm({ client }: { client: EditClientValues }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isLtd = client.type === "limited_company";

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            await updateClient({
              clientId: client.id,
              name: String(fd.get("name") || client.name),
              type: client.type,
              companyNumber: String(fd.get("companyNumber") || "") || undefined,
              companyAuthCode:
                String(fd.get("companyAuthCode") || "") || undefined,
              utr: String(fd.get("utr") || "") || undefined,
              vrn: String(fd.get("vrn") || "") || undefined,
              nino: String(fd.get("nino") || "") || undefined,
              payeRef: String(fd.get("payeRef") || "") || undefined,
              accountsOfficeRef:
                String(fd.get("accountsOfficeRef") || "") || undefined,
              contactEmail: String(fd.get("contactEmail") || "") || undefined,
              contactPhone: String(fd.get("contactPhone") || "") || undefined,
              isEmployer: fd.get("isEmployer") === "on",
              isVatRegistered: fd.get("isVatRegistered") === "on",
            });
            router.push(`/clients/${client.slug}`);
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          }
        });
      }}
    >
      <div>
        <label className="label" htmlFor="name">
          Client name
        </label>
        <input
          id="name"
          name="name"
          className="input"
          required
          defaultValue={client.name}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {isLtd ? (
          <div>
            <label className="label" htmlFor="companyNumber">
              Company number
            </label>
            <input
              id="companyNumber"
              name="companyNumber"
              className="input"
              defaultValue={client.companyNumber ?? ""}
            />
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="contactEmail">
            Email
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            className="input"
            placeholder="client@example.com"
            defaultValue={client.contactEmail ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="contactPhone">
            Phone
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            className="input"
            placeholder="07…"
            defaultValue={client.contactPhone ?? ""}
          />
        </div>
        {isLtd ? (
          <div>
            <label className="label" htmlFor="companyAuthCode">
              Company authentication code
            </label>
            <input
              id="companyAuthCode"
              name="companyAuthCode"
              className="input font-mono uppercase"
              autoComplete="off"
              maxLength={12}
              placeholder="From Companies House letter"
              defaultValue={client.companyAuthCode ?? ""}
            />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="nino">
              NINO
            </label>
            <input
              id="nino"
              name="nino"
              className="input"
              defaultValue={client.nino ?? ""}
            />
          </div>
        )}
        <div>
          <label className="label" htmlFor="utr">
            UTR
          </label>
          <input
            id="utr"
            name="utr"
            className="input"
            defaultValue={client.utr ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="vrn">
            VRN
          </label>
          <input
            id="vrn"
            name="vrn"
            className="input"
            defaultValue={client.vrn ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="payeRef">
            PAYE ref
          </label>
          <input
            id="payeRef"
            name="payeRef"
            className="input"
            defaultValue={client.payeRef ?? ""}
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
            defaultValue={client.accountsOfficeRef ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isVatRegistered"
            defaultChecked={client.isVatRegistered}
          />
          VAT registered
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isEmployer"
            defaultChecked={client.isEmployer}
          />
          Employer (PAYE)
        </label>
      </div>

      <FormErrorBanner error={error} />

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href={`/clients/${client.slug}`} className="btn btn-secondary">
          Cancel
        </Link>
      </div>
    </form>
  );
}

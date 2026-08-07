import { getClient } from "@/server/actions/clients";
import {
  listVatObligations,
  listVatReturns,
} from "@/server/actions/vat";
import { ClientTabs } from "@/components/client-tabs";
import { VatFilingForm } from "@/components/forms/vat-filing-form";

export default async function VatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  const obligations = await listVatObligations(id);
  const returns = await listVatReturns(id);

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        MTD VAT · VRN {client.vrn ?? "not set"}
      </p>
      <ClientTabs clientId={id} active="vat" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <h2 className="display text-2xl">File VAT return</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Prepare from ledger → review boxes → submit with fraud headers.
          </p>
          <div className="mt-4">
            <VatFilingForm clientId={id} obligations={obligations} />
          </div>
        </div>
        <div className="panel p-5">
          <h2 className="display text-2xl">Submitted returns</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {returns.length === 0 && (
              <li className="py-3 text-ink-soft">No returns yet.</li>
            )}
            {returns.map((r) => (
              <li key={String(r.id)} className="flex justify-between py-2">
                <span className="font-semibold">{String(r.periodKey)}</span>
                <span className="badge badge-ok">{String(r.status)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

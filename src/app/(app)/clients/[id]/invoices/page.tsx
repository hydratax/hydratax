import {
  listClientInvoices,
  listInvoiceLineTemplates,
} from "@/server/actions/invoices";
import { requireModule } from "@/server/auth/session";
import { InvoiceWorkspace } from "@/components/forms/invoice-workspace";
import { redirect } from "next/navigation";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function ClientInvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fee?: string; services?: string }>;
}) {
  try {
    await requireModule("invoices");
  } catch {
    redirect("/clients");
  }

  const { id: ref } = await params;
  const query = await searchParams;
  const fee = Number(query.fee);
  const initialLine =
    Number.isFinite(fee) && fee > 0
      ? {
          description: query.services?.trim()
            ? `Professional fees — ${query.services.trim()}`
            : "Professional fees",
          quantity: "1",
          unitPricePounds: fee.toFixed(2),
          vatRateBps: "2000" as const,
        }
      : null;
  const { client, clientId } = await loadClientPage(ref, "invoices");
  const [invoices, templates] = await Promise.all([
    listClientInvoices(clientId),
    listInvoiceLineTemplates(),
  ]);

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">Invoices</p>
      <InvoiceWorkspace
        clientId={clientId}
        clientName={client.name}
        clientEmail={client.contactEmail}
        invoices={invoices}
        templates={templates}
        initialLine={initialLine}
      />
    </div>
  );
}

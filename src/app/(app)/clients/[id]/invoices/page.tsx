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
}: {
  params: Promise<{ id: string }>;
}) {
  let session;
  try {
    session = await requireModule("invoices");
  } catch {
    redirect("/clients");
  }

  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref, "invoices");
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
      />
    </div>
  );
}

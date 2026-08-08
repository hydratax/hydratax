import { getClient } from "@/server/actions/clients";
import { listClientInvoices } from "@/server/actions/invoices";
import { requireModule } from "@/server/auth/session";
import { ClientTabs } from "@/components/client-tabs";
import { InvoiceWorkspace } from "@/components/forms/invoice-workspace";
import { redirect } from "next/navigation";

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

  const { id } = await params;
  const client = await getClient(id);
  const invoices = await listClientInvoices(id);

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">Invoices</p>
      <ClientTabs
        clientId={id}
        active="invoices"
        moduleAccess={session.moduleAccess}
      />
      <InvoiceWorkspace clientId={id} invoices={invoices} />
    </div>
  );
}

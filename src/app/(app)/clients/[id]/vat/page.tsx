import { getClient } from "@/server/actions/clients";
import {
  listVatObligations,
  listVatReturns,
} from "@/server/actions/vat";
import { getConnectionStatus } from "@/server/actions/hmrc-connect";
import { requireModule } from "@/server/auth/session";
import { ClientTabs } from "@/components/client-tabs";
import { VatReturnsWorkspace } from "@/components/forms/vat-returns-workspace";
import { redirect } from "next/navigation";

export default async function VatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let session;
  try {
    session = await requireModule("vat");
  } catch {
    redirect("/clients");
  }
  const { id } = await params;
  const client = await getClient(id);
  const [obligations, returns, connection] = await Promise.all([
    listVatObligations(id),
    listVatReturns(id),
    getConnectionStatus(id),
  ]);

  return (
    <div>
      <ClientTabs
        clientId={id}
        active="vat"
        moduleAccess={session.moduleAccess}
      />
      <VatReturnsWorkspace
        clientId={id}
        clientName={client.name}
        vrn={client.vrn ?? null}
        connected={connection.connected}
        signedIn
        obligations={obligations}
        returns={returns.map((r) => ({
          id: String(r.id),
          periodKey: String(r.periodKey),
          status: String(r.status),
        }))}
      />
    </div>
  );
}

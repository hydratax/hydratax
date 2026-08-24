import {
  listVatObligations,
  listVatReturns,
} from "@/server/actions/vat";
import { getConnectionStatus } from "@/server/actions/hmrc-connect";
import { requireModule } from "@/server/auth/session";
import { ClientTabs } from "@/components/client-tabs";
import { VatReturnsWorkspace } from "@/components/forms/vat-returns-workspace";
import { redirect } from "next/navigation";
import { loadClientPage } from "@/server/clients/resolve-client-page";

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
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref, "vat");
  const [obligations, returns, connection] = await Promise.all([
    listVatObligations(clientId).catch(() => []),
    listVatReturns(clientId).catch(() => []),
    getConnectionStatus(clientId).catch(() => ({
      connected: false,
      hmrcEnv: "sandbox" as const,
      scopes: "",
    })),
  ]);

  return (
    <div>
      <ClientTabs
        clientSlug={slug}
        active="vat"
        moduleAccess={session.moduleAccess}
      />
      <VatReturnsWorkspace
        clientId={clientId}
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

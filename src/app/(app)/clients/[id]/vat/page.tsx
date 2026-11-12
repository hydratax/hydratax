import {
  listVatObligations,
  listVatReturns,
} from "@/server/actions/vat";
import { getConnectionStatus } from "@/server/actions/hmrc-connect";
import { requireModule } from "@/server/auth/session";
import { VatReturnsWorkspace } from "@/components/forms/vat-returns-workspace";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function VatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireModule("vat");
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
      {client.deskProfile?.portal ? (
        <p className="mb-4 text-sm text-ink-soft">
          {client.deskProfile.portal.approveVat
            ? "The client has approved the VAT return on their link."
            : "The client link is active. VAT filing waits until they approve the return."}
        </p>
      ) : null}
      <VatReturnsWorkspace
        clientId={clientId}
        clientName={client.name}
        contactEmail={client.contactEmail ?? null}
        vrn={client.vrn ?? null}
        connected={connection.connected}
        signedIn
        obligations={obligations}
        returns={returns.map((r) => {
          const boxesRaw =
            "boxes" in r && r.boxes && typeof r.boxes === "object"
              ? (r.boxes as Record<string, unknown>)
              : null;
          const boxes = boxesRaw
            ? Object.fromEntries(
                Object.entries(boxesRaw).map(([k, v]) => [
                  k,
                  typeof v === "number"
                    ? (v / 100).toFixed(2)
                    : String(v ?? ""),
                ]),
              )
            : null;
          return {
            id: String(r.id),
            periodKey: String(r.periodKey),
            status: String(r.status),
            boxes,
          };
        })}
      />
    </div>
  );
}

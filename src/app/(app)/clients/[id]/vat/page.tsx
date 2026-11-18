import {
  listVatObligations,
  listVatReturns,
  checkBankTransactionsForVat,
} from "@/server/actions/vat";
import { listBankTransactions } from "@/server/actions/bank";
import { listCustomBankCategories } from "@/server/actions/custom-categories";
import { getConnectionStatus } from "@/server/actions/hmrc-connect";
import { requireModule } from "@/server/auth/session";
import { VatReturnsWorkspace } from "@/components/forms/vat-returns-workspace";
import { ClientDeskWorklogs } from "@/components/client-desk-worklogs";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { listClientDocuments } from "@/server/actions/documents";
import {
  isBankStatementDoc,
  toBankStatementSummary,
} from "@/lib/bank/statement-docs";

export default async function VatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireModule("vat");
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref, "vat");
  const [
    obligations,
    returns,
    connection,
    bankStats,
    documents,
    bankTransactions,
    customCategories,
  ] = await Promise.all([
      listVatObligations(clientId).catch(() => []),
      listVatReturns(clientId).catch(() => []),
      getConnectionStatus(clientId).catch(() => ({
        connected: false,
        hmrcEnv: "sandbox" as const,
        scopes: "",
      })),
      checkBankTransactionsForVat(clientId).catch(() => ({
        count: 0,
        earliest: null as string | null,
        latest: null as string | null,
      })),
      listClientDocuments(clientId).catch(() => []),
      listBankTransactions(clientId).catch(() => []),
      listCustomBankCategories().catch(() => []),
    ]);

  const statements = documents
    .filter(isBankStatementDoc)
    .map((d) =>
      toBankStatementSummary({
        id: d.id,
        filename: d.filename,
        blobUrl: d.blobUrl,
        contentType: d.contentType,
        sizeBytes: d.sizeBytes,
        createdAt: d.createdAt,
        category: d.category,
      }),
    )
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .slice(0, 24);

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
        vatRegistrationDate={client.vatRegistrationDate ?? null}
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
          const periodStart =
            "periodStart" in r && typeof r.periodStart === "string"
              ? r.periodStart
              : null;
          const periodEnd =
            "periodEnd" in r && typeof r.periodEnd === "string"
              ? r.periodEnd
              : null;
          return {
            id: String(r.id),
            periodKey: String(r.periodKey),
            status: String(r.status),
            boxes,
            periodStart,
            periodEnd,
          };
        })}
        bankTransactionCount={bankStats.count}
        bankEarliest={bankStats.earliest}
        bankLatest={bankStats.latest}
        bankStatements={statements}
        bankTransactions={bankTransactions.map((t) => ({
          id: String(t.id),
          dated: String(t.dated),
          description: String(t.description),
          amountPence: Number(t.amountPence),
          category: String(t.category ?? "uncategorised"),
          confidence: String(
            "confidence" in t && t.confidence != null
              ? t.confidence
              : "medium",
          ),
        }))}
        customCategories={customCategories}
        clientSlug={slug}
      />
      <ClientDeskWorklogs clientId={clientId} desk="vat" />
    </div>
  );
}

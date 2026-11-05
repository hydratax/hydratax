import { getTaxDraftFromBank, listBankTransactions } from "@/server/actions/bank";
import { listCustomBankCategories } from "@/server/actions/custom-categories";
import { listClientDocuments } from "@/server/actions/documents";
import { BankWorkspace } from "@/components/forms/bank-workspace";
import { loadClientPage } from "@/server/clients/resolve-client-page";

function isBankStatementDoc(doc: {
  filename: string;
  contentType: string;
  category: string;
}) {
  const name = doc.filename.toLowerCase();
  const type = doc.contentType.toLowerCase();
  const bankLike =
    type.includes("pdf") ||
    type.includes("csv") ||
    type.includes("sheet") ||
    type.includes("excel") ||
    name.endsWith(".pdf") ||
    name.endsWith(".csv") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx");
  return bankLike && (doc.category === "accounts" || doc.category === "general");
}

export default async function ClientBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { slug, clientId } = await loadClientPage(ref, "bank");
  const transactions = await listBankTransactions(clientId).catch(() => []);
  const draft = await getTaxDraftFromBank(clientId);
  const customCategories = await listCustomBankCategories().catch(() => []);
  const documents = await listClientDocuments(clientId).catch(() => []);
  const statements = documents
    .filter(isBankStatementDoc)
    .slice(0, 12)
    .map((d) => ({
      id: d.id,
      filename: d.filename,
      blobUrl: d.blobUrl,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      createdAt:
        typeof d.createdAt === "string"
          ? d.createdAt
          : d.createdAt.toISOString(),
    }));

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        Bank feeds &amp; statements · categorise · draft SA / CT
      </p>
      <BankWorkspace
        clientId={clientId}
        clientSlug={slug}
        transactions={transactions.map((t) => ({
          id: t.id,
          dated: t.dated,
          description: t.description,
          amountPence: t.amountPence,
          category: t.category,
          confidence: t.confidence,
        }))}
        draft={draft}
        customCategories={customCategories}
        statements={statements}
      />
    </div>
  );
}

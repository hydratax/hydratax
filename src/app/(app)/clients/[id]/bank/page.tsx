import { getTaxDraftFromBank, listBankTransactions } from "@/server/actions/bank";
import { listCustomBankCategories } from "@/server/actions/custom-categories";
import { BankWorkspace } from "@/components/forms/bank-workspace";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function ClientBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref, "bank");
  const transactions = await listBankTransactions(clientId).catch(() => []);
  const draft = await getTaxDraftFromBank(clientId);
  const customCategories = await listCustomBankCategories().catch(() => []);

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
      />
    </div>
  );
}

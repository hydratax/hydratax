import { getTaxDraftFromBank, listBankTransactions } from "@/server/actions/bank";
import { listCustomBankCategories } from "@/server/actions/custom-categories";
import { ClientTabs } from "@/components/client-tabs";
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
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
        Client workspace
      </p>
      <h1 className="display mt-1 text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        Bank feeds &amp; statements · categorise · draft SA / CT
      </p>
      <ClientTabs clientSlug={slug} active="bank" />
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

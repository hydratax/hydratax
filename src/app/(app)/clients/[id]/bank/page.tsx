import { getClient } from "@/server/actions/clients";
import {
  getTaxDraftFromBank,
  listBankTransactions,
} from "@/server/actions/bank";
import { ClientTabs } from "@/components/client-tabs";
import { BankWorkspace } from "@/components/forms/bank-workspace";

export default async function ClientBankPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  const transactions = await listBankTransactions(id);
  const draft = await getTaxDraftFromBank(id);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
        Client workspace
      </p>
      <h1 className="display mt-1 text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        Bank feeds &amp; statements · categorise · draft SA / CT
      </p>
      <ClientTabs clientId={id} active="bank" />
      <BankWorkspace
        clientId={id}
        transactions={transactions.map((t) => ({
          id: t.id,
          dated: t.dated,
          description: t.description,
          amountPence: t.amountPence,
          category: t.category,
          confidence: t.confidence,
        }))}
        draft={draft}
      />
    </div>
  );
}

import { AmlForm } from "@/components/forms/aml-form";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function AmlPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { client, clientId } = await loadClientPage(ref);
  const aml = client.deskProfile?.aml ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-3xl text-ink">Anti-money laundering</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Risk, identity evidence, and the next review date stay on {client.name}.
          This is the record a supervisor expects to see with the client file.
        </p>
      </div>
      <AmlForm clientId={clientId} initial={aml} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { requireModule } from "@/server/auth/session";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { listClientTimeEntries } from "@/server/actions/time-fees";
import { TimeFeesWorkspace } from "@/components/forms/time-fees-workspace";

export default async function ClientTimeFeesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireModule("invoices");
  } catch {
    redirect("/clients");
  }

  const { id: ref } = await params;
  const { client, clientId, slug } = await loadClientPage(ref, "time-fees");
  const entries = await listClientTimeEntries(clientId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-3xl text-ink">Time &amp; fees</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Log billable hours for {client.name}, keep a WIP balance, and raise a
          client invoice when you are ready to bill. This is practice fee WIP —
          not HydraTax subscription billing.
        </p>
      </div>
      <TimeFeesWorkspace
        clientId={clientId}
        clientSlug={slug}
        clientName={client.name}
        initial={entries}
      />
    </div>
  );
}

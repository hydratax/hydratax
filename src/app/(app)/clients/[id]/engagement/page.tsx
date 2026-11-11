import Link from "next/link";
import { EngagementForm } from "@/components/forms/engagement-form";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function EngagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl text-ink">Letter of engagement</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">
            Record services and fee, send for e-signature, then bill{" "}
            {client.name} from Invoices.
          </p>
        </div>
        <Link
          href={`/clients/${slug}/invoices?fee=${encodeURIComponent(
            String(client.deskProfile?.engagement?.feePounds ?? ""),
          )}&services=${encodeURIComponent(
            (client.deskProfile?.engagement?.services ?? []).join(", "),
          )}`}
          className="btn btn-secondary"
        >
          Raise fee invoice
        </Link>
      </div>
      <EngagementForm
        clientId={clientId}
        clientName={client.name}
        initial={client.deskProfile?.engagement ?? null}
        initialPortal={client.deskProfile?.portal ?? null}
      />
    </div>
  );
}

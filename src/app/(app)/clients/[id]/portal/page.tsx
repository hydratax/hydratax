import { PortalLinkButton } from "@/components/forms/portal-link-button";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function ClientPortalAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { client, clientId } = await loadClientPage(ref);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-3xl text-ink">Client link</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Send {client.name} this link to upload what you asked for and approve
          accounts, the Company Tax Return, and VAT before you file.
        </p>
      </div>
      <PortalLinkButton
        clientId={clientId}
        initial={client.deskProfile?.portal ?? null}
      />
    </div>
  );
}

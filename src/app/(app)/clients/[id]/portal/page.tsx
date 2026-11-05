import { PortalLinkButton } from "@/components/forms/portal-link-button";
import { listClientDocuments } from "@/server/actions/documents";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function ClientPortalAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { client, clientId, slug } = await loadClientPage(ref);
  const documents = await listClientDocuments(clientId).catch(() => []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-3xl text-ink">Client link</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Send {client.name} this link to upload bank statements and other
          papers, review drafts you attach, and approve accounts, the Company
          Tax Return, and VAT before you file.
        </p>
      </div>
      <PortalLinkButton
        clientId={clientId}
        clientSlug={slug}
        initial={client.deskProfile?.portal ?? null}
        documents={documents.map((d) => ({
          id: d.id,
          filename: d.filename,
        }))}
      />
    </div>
  );
}

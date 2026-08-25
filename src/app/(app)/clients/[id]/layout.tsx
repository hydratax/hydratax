import { ClientTabs } from "@/components/client-tabs";
import { ClientWorkspaceHeader } from "@/components/client-workspace-header";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { requireSession } from "@/server/auth/session";

export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id: ref } = await params;
  const { client, slug } = await loadClientPage(ref);

  return (
    <div>
      <ClientWorkspaceHeader client={client} />
      <ClientTabs
        clientSlug={slug}
        moduleAccess={session.moduleAccess}
      />
      {children}
    </div>
  );
}

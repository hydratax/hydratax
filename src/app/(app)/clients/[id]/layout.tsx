import { ClientTabs } from "@/components/client-tabs";
import { ClientWorkspaceHeader } from "@/components/client-workspace-header";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { requireSession } from "@/server/auth/session";
import { getPracticeEntitlements } from "@/server/actions/account";

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
  const entitlements = await getPracticeEntitlements().catch(() => null);

  return (
    <div>
      <ClientWorkspaceHeader client={client} />
      <ClientTabs
        clientSlug={slug}
        moduleAccess={session.moduleAccess}
        clientType={client.type}
        unlockedPlanModules={entitlements?.modules ?? []}
      />
      {children}
    </div>
  );
}

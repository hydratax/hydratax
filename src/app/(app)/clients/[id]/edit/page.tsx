import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { ClientTabs } from "@/components/client-tabs";
import { EditClientForm } from "@/components/forms/edit-client-form";

export const metadata = { title: "Edit client — HydraTax" };

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (session.role === "readonly") {
    redirect("/clients");
  }
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
        Client workspace
      </p>
      <h1 className="display mt-1 text-4xl text-ink">Edit client</h1>
      <p className="mt-1 text-ink-soft">
        Update contact details, tax identifiers, and filing flags for{" "}
        <span className="font-medium text-ink">{client.name}</span>.
      </p>
      <ClientTabs
        clientSlug={slug}
        active="overview"
        moduleAccess={session.moduleAccess}
      />

      <div className="panel mt-6 p-5">
        <EditClientForm
          client={{
            id: clientId,
            slug,
            name: client.name,
            type: client.type,
            companyNumber: client.companyNumber,
            utr: client.utr,
            vrn: client.vrn,
            nino: client.nino,
            payeRef: client.payeRef,
            accountsOfficeRef: client.accountsOfficeRef,
            contactEmail: client.contactEmail ?? null,
            contactPhone:
              "contactPhone" in client
                ? ((client as { contactPhone?: string | null }).contactPhone ??
                  null)
                : null,
            isEmployer: client.isEmployer,
            isVatRegistered: client.isVatRegistered,
          }}
        />
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        <Link href={`/clients/${slug}`} className="font-semibold text-sea">
          ← Back to overview
        </Link>
      </p>
    </div>
  );
}

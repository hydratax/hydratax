import { notFound } from "next/navigation";
import { ClientPortalForm } from "@/components/forms/client-portal-form";
import { findClientByPortalToken } from "@/server/actions/desk";

export const metadata = {
  title: "Client papers — HydraTax",
};

export default async function PublicPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await findClientByPortalToken(token);
  if (!client?.deskProfile?.portal) notFound();

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
        HydraTax
      </p>
      <h1 className="display mt-2 text-3xl text-ink">{client.name}</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Tick the papers you have sent and approve the filings your accountant
        has prepared. This page does not submit anything to HMRC or Companies
        House.
      </p>
      <div className="mt-8">
        <ClientPortalForm
          token={token}
          portal={client.deskProfile.portal}
          clientName={client.name}
        />
      </div>
    </main>
  );
}

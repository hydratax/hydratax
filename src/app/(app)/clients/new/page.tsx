import { AddClientChooser } from "@/components/forms/add-client-chooser";
import { listClients } from "@/server/actions/clients";
import { clientSlugFor } from "@/lib/client-slug";
import { requireSession } from "@/server/auth/session";

type Props = {
  searchParams: Promise<{ desk?: string }>;
};

export default async function NewClientPage({ searchParams }: Props) {
  await requireSession();
  const sp = await searchParams;
  const desk =
    sp.desk === "vat" || sp.desk === "payroll" ? sp.desk : ("all" as const);

  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const companies = clients
    .filter((c) => c.type === "limited_company")
    .map((c) => ({
      id: c.id,
      slug: clientSlugFor(c, peers),
      name: c.name,
      companyNumber: c.companyNumber,
      vrn: c.vrn,
      payeRef: c.payeRef,
      isVatRegistered: c.isVatRegistered,
      isEmployer: c.isEmployer,
      contactEmail: c.contactEmail ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

  const title =
    desk === "vat"
      ? "Add VAT client"
      : desk === "payroll"
        ? "Add PAYE client"
        : "Add client";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="display text-4xl text-ink">{title}</h1>
        <p className="mt-1 text-ink-soft">
          Pick a company already on your practice, or open the new client form.
        </p>
      </div>
      <AddClientChooser companies={companies} desk={desk} />
    </div>
  );
}

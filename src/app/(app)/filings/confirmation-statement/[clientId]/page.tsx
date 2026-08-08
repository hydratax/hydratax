import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient } from "@/server/actions/clients";
import { requireSession } from "@/server/auth/session";
import { ConfirmationStatementWizard } from "@/components/forms/confirmation-statement-wizard";
import { getCsFilingReadiness } from "@/server/companies-house/filing/confirmation-statement";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

export const metadata = {
  title: "File Confirmation Statement — HydraTax",
};

export default async function FileConfirmationStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ company?: string }>;
}) {
  await requireSession();
  const { clientId } = await params;
  const query = await searchParams;

  let client;
  try {
    client = await getClient(clientId);
  } catch {
    notFound();
  }

  const snapshot =
    "companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null;

  const companyNumber =
    query.company?.toUpperCase() ||
    client.companyNumber ||
    snapshot?.companyNumber ||
    "";

  const readiness = getCsFilingReadiness();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Confirmation Statement
          </p>
          <h1 className="display mt-2 text-3xl text-ink md:text-4xl">
            {snapshot?.companyName ?? client.name}
          </h1>
          <p className="mono mt-1 text-sm text-ink-soft">
            {companyNumber || "No company number"}
          </p>
        </div>
        <Link
          href="/filings/confirmation-statement"
          className="btn btn-secondary text-sm"
        >
          All CS filings
        </Link>
      </div>

      <ConfirmationStatementWizard
        defaults={{
          companyNumber,
          clientId,
        }}
        readiness={readiness}
        snapshot={snapshot}
      />
    </div>
  );
}

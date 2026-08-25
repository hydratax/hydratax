import {
  getPayrollPackSettings,
  listEmployees,
  listPayRuns,
} from "@/server/actions/payroll";
import { requireModule } from "@/server/auth/session";
import { PayrollWorkspace } from "@/components/forms/payroll-workspace";
import { redirect } from "next/navigation";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let session;
  try {
    session = await requireModule("payroll");
  } catch {
    redirect("/clients");
  }
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref, "payroll");
  const [pack, employees, payRuns] = await Promise.all([
    getPayrollPackSettings(clientId).catch(() => ({
      hasPackPassword: false,
      contactEmail: client.contactEmail ?? null,
    })),
    listEmployees(clientId, { includeLeavers: true }).catch(() => []),
    listPayRuns(clientId).catch(() => []),
  ]);

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        PAYE / RTI payroll · timesheets · statutory pay · password-protected packs
      </p>
      <PayrollWorkspace
        clientId={clientId}
        clientName={client.name}
        payeRef={client.payeRef}
        accountsOfficeRef={client.accountsOfficeRef}
        isEmployer={client.isEmployer}
        employees={employees}
        payRuns={payRuns as never}
        hasPackPassword={pack.hasPackPassword}
        contactEmail={pack.contactEmail}
      />
    </div>
  );
}

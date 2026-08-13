import { getClient } from "@/server/actions/clients";
import {
  getPayrollPackSettings,
  listEmployees,
  listPayRuns,
} from "@/server/actions/payroll";
import { requireModule } from "@/server/auth/session";
import { ClientTabs } from "@/components/client-tabs";
import { PayrollWorkspace } from "@/components/forms/payroll-workspace";
import { redirect } from "next/navigation";

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
  const { id } = await params;
  const pack = await getPayrollPackSettings(id);
  const client = await getClient(id);
  const employees = await listEmployees(id, { includeLeavers: true });
  const payRuns = await listPayRuns(id);

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        PAYE / RTI payroll · timesheets · statutory pay · password-protected packs
      </p>
      <ClientTabs
        clientId={id}
        active="payroll"
        moduleAccess={session.moduleAccess}
      />
      <PayrollWorkspace
        clientId={id}
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

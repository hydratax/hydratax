import {
  getPayrollPackSettings,
  listEmployees,
  listPayRuns,
} from "@/server/actions/payroll";
import { getPayrollDeskSettings } from "@/server/actions/payroll-settings";
import { requireModule } from "@/server/auth/session";
import { PayrollWorkspace } from "@/components/forms/payroll-workspace";
import { redirect } from "next/navigation";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireModule("payroll");
  } catch {
    redirect("/clients");
  }
  const { id: ref } = await params;
  const { client, clientId } = await loadClientPage(ref, "payroll");
  const [pack, employees, payRuns, payrollSettings] = await Promise.all([
    getPayrollPackSettings(clientId).catch(() => ({
      hasPackPassword: false,
      contactEmail: client.contactEmail ?? null,
    })),
    listEmployees(clientId, { includeLeavers: true }).catch(() => []),
    listPayRuns(clientId).catch(() => []),
    getPayrollDeskSettings(clientId).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="gloss-badge inline-flex rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
          PAYE · RTI
        </p>
        <h1 className="display mt-3 text-[clamp(1.75rem,3.5vw,2.6rem)] leading-[1.1] tracking-tight text-ink">
          Payroll
        </h1>
      </div>
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
        payrollSettings={payrollSettings}
      />
    </div>
  );
}

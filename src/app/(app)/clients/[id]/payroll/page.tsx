import {
  getPayrollPackSettings,
  listEmployees,
  listPayRuns,
} from "@/server/actions/payroll";
import { getPayrollDeskSettings } from "@/server/actions/payroll-settings";
import { requireModule } from "@/server/auth/session";
import { PayrollWorkspace } from "@/components/forms/payroll-workspace";
import { ClientDeskWorklogs } from "@/components/client-desk-worklogs";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { getHmrcConfig } from "@/server/hmrc/config";
import { PRESENTATION_DEMO_TAG } from "@/server/demo/presentation-seed";

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModule("payroll");
  const { id: ref } = await params;
  const { client, clientId } = await loadClientPage(ref, "payroll");
  let employees = await listEmployees(clientId, {
    includeLeavers: true,
  }).catch(() => []);

  // Presentation employers must show people — heal empty desks on open.
  // Do not call enableEmployer / revalidatePath from this RSC path.
  const isPresentation =
    client.deskProfile?.presentationDemo === PRESENTATION_DEMO_TAG;
  const name = client.name.trim().toLowerCase();
  if (
    isPresentation &&
    client.isEmployer &&
    employees.length === 0 &&
    (name === "meridian retail limited" || name === "northstar digital ltd")
  ) {
    const { ensureDemoPayrollEmployeesQuiet } = await import(
      "@/server/actions/presentation-rich-demo"
    );
    await ensureDemoPayrollEmployeesQuiet(clientId).catch(() => null);
    employees = await listEmployees(clientId, {
      includeLeavers: true,
    }).catch(() => []);
  }

  let [pack, payRuns, payrollSettings] = await Promise.all([
    getPayrollPackSettings(clientId).catch(() => ({
      hasPackPassword: false,
      contactEmail: client.contactEmail ?? null,
    })),
    listPayRuns(clientId).catch(() => []),
    getPayrollDeskSettings(clientId).catch(() => null),
  ]);

  if (
    isPresentation &&
    client.isEmployer &&
    employees.length > 0 &&
    payRuns.length === 0 &&
    (name === "meridian retail limited" || name === "northstar digital ltd")
  ) {
    const { ensureDemoPayHistoryQuiet } = await import(
      "@/server/actions/presentation-rich-demo"
    );
    await ensureDemoPayHistoryQuiet(clientId).catch(() => null);
    payRuns = await listPayRuns(clientId).catch(() => []);
  }

  const hmrcLive = getHmrcConfig().env === "production";

  return (
    <div className="space-y-6">
      <div>
        <p className="gloss-badge inline-flex items-center gap-1.5 rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
          Payroll
        </p>
        <h1 className="display mt-3 text-[clamp(1.75rem,3.5vw,2.6rem)] leading-[1.1] tracking-tight text-ink">
          Payroll
        </h1>
      </div>
      <PayrollWorkspace
        clientId={clientId}
        clientName={client.name}
        hmrcLive={hmrcLive}
        payeRef={client.payeRef}
        accountsOfficeRef={client.accountsOfficeRef}
        isEmployer={client.isEmployer}
        employees={employees}
        payRuns={payRuns as never}
        hasPackPassword={pack.hasPackPassword}
        contactEmail={pack.contactEmail}
        payrollSettings={payrollSettings}
      />
      <ClientDeskWorklogs clientId={clientId} desk="paye" />
    </div>
  );
}

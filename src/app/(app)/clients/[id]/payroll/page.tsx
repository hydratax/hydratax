import { getClient } from "@/server/actions/clients";
import { listEmployees, listPayRuns } from "@/server/actions/payroll";
import { ClientTabs } from "@/components/client-tabs";
import { AddEmployeeForm, PayRunForm } from "@/components/forms/payroll-forms";
import { money } from "@/lib/format";

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  const employees = await listEmployees(id);
  const payRuns = await listPayRuns(id);

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        RTI payroll · PAYE {client.payeRef ?? "not set"}
      </p>
      <ClientTabs clientId={id} active="payroll" />

      {!client.isEmployer ? (
        <div className="panel p-5 text-ink-soft">
          Enable employer status and PAYE refs on this client to run payroll.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="panel p-5">
              <h2 className="display text-2xl">Employees</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {employees.map((e) => (
                  <li key={e.id} className="flex justify-between py-2">
                    <span>
                      {e.forename} {e.surname}{" "}
                      <span className="mono text-ink-soft">{e.nino}</span>
                    </span>
                    <span className="mono">{money(e.annualSalaryPence)}/yr</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-line pt-4">
                <AddEmployeeForm clientId={id} />
              </div>
            </div>
            <div className="panel p-5">
              <h2 className="display text-2xl">Pay run + FPS</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Calculate PAYE/NIC in pence, build FPS XML, submit to HMRC RTI.
              </p>
              <div className="mt-4">
                <PayRunForm clientId={id} />
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="display text-2xl">Pay run history</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {payRuns.length === 0 && (
                <li className="py-3 text-ink-soft">No pay runs yet.</li>
              )}
              {payRuns.map((p) => (
                <li key={String(p.id)} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-semibold">
                    Pay date {String(p.payDate)}
                  </span>
                  <span className="badge badge-ok">{String(p.status)}</span>
                  <span className="mono w-full text-ink-soft">
                    Gross{" "}
                    {money(
                      Number(
                        (p.totals as { grossPence?: number })?.grossPence ?? 0,
                      ),
                    )}{" "}
                    · {String(p.hmrcCorrelationId ?? "")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

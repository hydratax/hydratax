import { getClient } from "@/server/actions/clients";
import { listSaSubmissions } from "@/server/actions/self-assessment";
import { ClientTabs } from "@/components/client-tabs";
import { SaFilingForm } from "@/components/forms/sa-filing-form";
import { money } from "@/lib/format";

export default async function SelfAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  const submissions = await listSaSubmissions(id);

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        Self Assessment / MTD Income Tax · NINO {client.nino ?? "not set"}
      </p>
      <ClientTabs clientId={id} active="self-assessment" />

      {client.type === "limited_company" ? (
        <div className="panel p-5 text-ink-soft">
          Self Assessment applies to sole traders and partners. Use Corporation
          Tax for this limited company.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="panel p-5">
            <h2 className="display text-2xl">Quarterly update</h2>
            <div className="mt-4">
              <SaFilingForm clientId={id} />
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="display text-2xl">Submissions</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {submissions.length === 0 && (
                <li className="py-3 text-ink-soft">No submissions yet.</li>
              )}
              {submissions.map((s) => (
                <li key={String(s.id)} className="py-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">{String(s.taxYear)}</span>
                    <span className="badge badge-ok">{String(s.status)}</span>
                  </div>
                  <p className="mono text-ink-soft">
                    Turnover {money(Number(s.turnoverPence))} · Expenses{" "}
                    {money(Number(s.expensesPence))}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

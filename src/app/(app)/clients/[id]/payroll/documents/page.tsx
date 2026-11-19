import Link from "next/link";
import { requireModule } from "@/server/auth/session";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { listEmployees } from "@/server/actions/payroll";
import { taxYearFromDate } from "@/lib/payroll";
import { maskNino } from "@/lib/mask-identifiers";

export default async function PayrollTeamDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ taxYear?: string }>;
}) {
  await requireModule("payroll");
  const { id: ref } = await params;
  const sp = await searchParams;
  const { client, clientId } = await loadClientPage(ref, "payroll/documents");
  const employees = await listEmployees(clientId, {
    includeLeavers: true,
  }).catch(() => []);
  const taxYear =
    sp.taxYear?.trim() ||
    taxYearFromDate(new Date().toISOString().slice(0, 10));
  const sorted = [...employees].sort((a, b) =>
    `${a.surname} ${a.forename}`.localeCompare(
      `${b.surname} ${b.forename}`,
      "en-GB",
      { sensitivity: "base" },
    ),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div>
        <p className="gloss-badge inline-flex rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
          Team documents
        </p>
        <h1 className="display mt-3 text-3xl text-ink">{client.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Year-end forms for everyone · tax year {taxYear}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line/80 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line/80 bg-sand/40 text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">NI</th>
              <th className="px-4 py-3 font-semibold">Documents</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <span className="font-semibold text-ink">
                    {e.surname}, {e.forename}
                  </span>
                  {!e.active ? (
                    <span className="ml-2 text-xs text-ink-soft">leaver</span>
                  ) : null}
                </td>
                <td className="figures px-4 py-3 text-ink-soft">
                  {maskNino(e.nino)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-3">
                    <Link
                      className="font-semibold text-sea hover:underline"
                      href={`/clients/${clientId}/payroll/p60/${e.id}?year=${encodeURIComponent(taxYear)}`}
                      target="_blank"
                    >
                      P60
                    </Link>
                    <Link
                      className="font-semibold text-sea hover:underline"
                      href={`/clients/${clientId}/payroll/p11d/${e.id}?taxYear=${encodeURIComponent(taxYear)}`}
                      target="_blank"
                    >
                      P11D
                    </Link>
                    {!e.active && e.leaveDate ? (
                      <Link
                        className="font-semibold text-sea hover:underline"
                        href={`/clients/${clientId}/payroll/p45/${e.id}`}
                        target="_blank"
                      >
                        P45
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-ink-soft"
                >
                  No employees on this payroll yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Link
        href={`/clients/${clientId}/payroll`}
        className="inline-flex text-sm font-semibold text-sea hover:underline"
      >
        ← Back to payroll
      </Link>
    </div>
  );
}

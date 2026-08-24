import {
  listSaSubmissions,
} from "@/server/actions/self-assessment";
import {
  getSa100Draft,
  listSa100Returns,
} from "@/server/actions/sa100";
import { ClientTabs } from "@/components/client-tabs";
import { SaFilingForm } from "@/components/forms/sa-filing-form";
import { Sa100Wizard } from "@/components/forms/sa100-wizard";
import { money } from "@/lib/format";
import { loadClientPage } from "@/server/clients/resolve-client-page";

export default async function SelfAssessmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref, "self-assessment");
  const [submissions, sa100Draft, sa100Returns] = await Promise.all([
    listSaSubmissions(clientId).catch(() => []),
    getSa100Draft(clientId, "2025-26").catch(() => null),
    listSa100Returns(clientId).catch(() => []),
  ]);

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        Self Assessment · tax year 2025–26 (SA100) · NINO{" "}
        {client.nino ?? "not set"} · UTR {client.utr ?? "not set"}
      </p>
      <ClientTabs clientSlug={slug} active="self-assessment" />

      {client.type === "limited_company" ? (
        <div className="panel p-5 text-ink-soft">
          Self Assessment applies to sole traders and partners. Use Corporation
          Tax for this limited company.
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="display text-3xl text-ink">Year-end tax return</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-soft">
              Interactive SA100 for 6 April 2025 to 5 April 2026. Boxes follow
              HMRC&apos;s SA100 2026 pages TR1–TR8. Your tax bill updates live
              using 2025–26 rates before you submit. After submit you can
              download a filled SA100 summary PDF and an SA302-style calculation.
            </p>
            <div className="mt-5">
              <Sa100Wizard
                clientId={clientId}
                clientName={client.name}
                utr={client.utr}
                nino={client.nino}
                initial={sa100Draft?.draft ?? null}
              />
            </div>
          </section>

          {sa100Returns.length > 0 && (
            <section className="panel p-5">
              <h2 className="display text-2xl">Filed SA100 returns</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {sa100Returns.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="font-semibold">
                        {r.taxYear}{" "}
                        <span className="badge badge-ok">{r.status}</span>
                      </p>
                      <p className="font-mono text-ink-soft">
                        {r.calculation.amountDue > 0
                          ? `Due ${money(Math.round(r.calculation.amountDue * 100))}`
                          : r.calculation.refundDue > 0
                            ? `Refund ${money(Math.round(r.calculation.refundDue * 100))}`
                            : "Nil"}
                        {r.hmrcCorrelationId
                          ? ` · ${r.hmrcCorrelationId}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-3 text-xs font-semibold">
                      <a
                        className="text-sea underline-offset-2 hover:underline"
                        href={`/api/clients/${clientId}/sa100/${r.id}/sa100.pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        SA100 PDF
                      </a>
                      <a
                        className="text-sea underline-offset-2 hover:underline"
                        href={`/api/clients/${clientId}/sa100/${r.id}/sa302.pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        SA302 PDF
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="panel p-5">
              <h2 className="display text-2xl">MTD quarterly update</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Separate from the year-end SA100 — send Income Tax Self
                Assessment periodic updates from the books.
              </p>
              <div className="mt-4">
                <SaFilingForm clientId={clientId} />
              </div>
            </div>
            <div className="panel p-5">
              <h2 className="display text-2xl">Quarterly submissions</h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {submissions.length === 0 && (
                  <li className="py-3 text-ink-soft">No quarterly updates yet.</li>
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
          </section>
        </div>
      )}
    </div>
  );
}

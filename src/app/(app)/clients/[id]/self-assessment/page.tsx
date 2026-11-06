import Link from "next/link";
import { redirect } from "next/navigation";
import { listSaSubmissions } from "@/server/actions/self-assessment";
import {
  getSa100Draft,
  listSa100Returns,
} from "@/server/actions/sa100";
import { listSaTaxpayers } from "@/server/actions/sa-taxpayers";
import { listClientDocuments } from "@/server/actions/documents";
import {
  getDirectorWorkspace,
  listPracticeDirectors,
} from "@/server/actions/sa-directors";
import { SaFilingForm } from "@/components/forms/sa-filing-form";
import { Sa100Wizard } from "@/components/forms/sa100-wizard";
import { SaTaxpayerManager } from "@/components/forms/sa-taxpayer-manager";
import { SaPersonalBooks } from "@/components/forms/sa-personal-books";
import { SaDirectorIncomeDesk } from "@/components/forms/sa-director-income-desk";
import { SaPersonProfile } from "@/components/forms/sa-person-profile";
import { SaTaxYearWorkspace } from "@/components/forms/sa-tax-year-workspace";
import { money } from "@/lib/format";
import {
  normalizePersonName,
  roleFromCompanyLinks,
} from "@/lib/sa-taxpayer";
import { accumulateSa100FromIncome } from "@/lib/sa-income";
import { filingSaTaxYear, parseSaTaxYearLabel } from "@/lib/sa-tax-year";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { EmailToClientButton } from "@/components/forms/email-to-client-button";

export default async function SelfAssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ person?: string; year?: string }>;
}) {
  const { id: ref } = await params;
  const sp = (await searchParams) ?? {};
  const { client, slug, clientId } = await loadClientPage(ref, "self-assessment");
  const isLimited = client.type === "limited_company";
  const filingYear = filingSaTaxYear();
  const yearParam = sp.year?.trim() || "";
  const activeYear =
    (yearParam && parseSaTaxYearLabel(yearParam)?.label) || filingYear.label;

  const [taxpayers, documents, submissions, allPracticeDirectors] =
    await Promise.all([
      listSaTaxpayers(clientId),
      listClientDocuments(clientId).catch(() => []),
      listSaSubmissions(clientId).catch(() => []),
      listPracticeDirectors().catch(() => []),
    ]);

  // On a company desk, only people linked to this company.
  const practiceDirectors = isLimited
    ? allPracticeDirectors.filter((d) =>
        d.companies.some((c) => c.clientId === clientId),
      )
    : allPracticeDirectors;

  const personParam = sp.person?.trim() || "";
  const matchedDirector =
    practiceDirectors.find((d) => d.key === personParam) ||
    practiceDirectors.find(
      (d) => normalizePersonName(d.fullName) === normalizePersonName(personParam),
    ) ||
    practiceDirectors.find((d) => d.taxpayer?.id === personParam) ||
    null;

  // Directors / shareholders open on the personal SA desk, not the company tabs.
  if (isLimited && matchedDirector) {
    const yearQs = yearParam
      ? `?year=${encodeURIComponent(activeYear)}`
      : "";
    redirect(
      `/self-assessment/${encodeURIComponent(matchedDirector.key)}${yearQs}`,
    );
  }

  const workspace = matchedDirector
    ? await getDirectorWorkspace({
        homeClientId: matchedDirector.homeClientId,
        personKey: matchedDirector.key,
      }).catch(() => null)
    : null;

  const selected =
    workspace?.taxpayer ??
    taxpayers.find((t) => t.id === personParam) ??
    taxpayers[0] ??
    null;

  const selectedId = selected?.id ?? null;

  const saClientId = workspace?.person.homeClientId ?? clientId;
  const [sa100Draft, sa100Returns] = selected
    ? await Promise.all([
        getSa100Draft(saClientId, activeYear, selected.id).catch(() => null),
        listSa100Returns(saClientId, selected.id).catch(() => []),
      ])
    : [null, [] as Awaited<ReturnType<typeof listSa100Returns>>];

  const accumulated = selected
    ? accumulateSa100FromIncome(selected, {
        ...(sa100Draft?.draft ?? {}),
        taxYear: activeYear,
      })
    : null;

  const yearHrefBase = matchedDirector
    ? `/clients/${slug}/self-assessment?person=${encodeURIComponent(matchedDirector.key)}`
    : `/clients/${slug}/self-assessment`;

  const canSyncFromCh = Boolean(
    isLimited &&
      ((client.companiesHouse?.directors?.length ?? 0) > 0 ||
        (client.companiesHouse?.pscs?.length ?? 0) > 0),
  );

  return (
    <div className="space-y-8">
      {!matchedDirector ? (
        <div>
          <h1 className="display text-3xl text-ink md:text-4xl">
            Self Assessment
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Tax year 2025–26 · SA100</p>
        </div>
      ) : null}

      {/* Person picker only when no person is open — avoids looping the full grid */}
      {!matchedDirector && isLimited && practiceDirectors.length > 0 ? (
        <section>
          <ul className="grid gap-2 sm:grid-cols-2">
            {practiceDirectors.map((d) => (
              <li key={d.key}>
                <Link
                  href={`/self-assessment/${encodeURIComponent(d.key)}`}
                  className="panel panel-interactive block p-4"
                >
                  <p className="font-semibold text-ink">{d.fullName}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!matchedDirector &&
      (!isLimited || practiceDirectors.length === 0) ? (
        <SaTaxpayerManager
          clientId={clientId}
          clientSlug={slug}
          taxpayers={taxpayers}
          selectedId={selectedId}
          isLimitedCompany={isLimited}
          canSyncFromCh={canSyncFromCh}
        />
      ) : null}

      {!selected ? (
        <div className="panel p-5 text-ink-soft">
          Select a person above to open their companies, personal books and
          SA100 return.
        </div>
      ) : (
        <>
          <SaPersonProfile
            key={`${selected.id}-profile`}
            clientId={saClientId}
            taxpayer={selected}
            lockedRole={
              workspace
                ? roleFromCompanyLinks({
                    directorOf: workspace.person.directorOf,
                    shareholderOf: workspace.person.shareholderOf,
                  })
                : undefined
            }
          />

          {workspace ? (
            <SaDirectorIncomeDesk
              key={selected.id}
              homeClientId={workspace.person.homeClientId}
              person={workspace.person}
              initialTaxpayer={workspace.taxpayer}
            />
          ) : (
            <SaDirectorIncomeDesk
              key={selected.id}
              homeClientId={saClientId}
              person={{
                key: normalizePersonName(selected.fullName),
                fullName: selected.fullName,
                companies: [],
                directorOf: 0,
                shareholderOf: 0,
                taxpayer: selected,
                homeClientId: saClientId,
                homeSlug: slug,
                filing: {
                  taxYear: activeYear,
                  filingDue: filingYear.filingDue,
                  status: "none",
                  urgency: "unknown",
                },
              }}
              initialTaxpayer={selected}
            />
          )}

          <SaPersonalBooks
            clientId={clientId}
            taxpayerId={selected.id}
            taxpayerName={selected.fullName}
            documents={documents.map((d) => ({
              id: d.id,
              filename: d.filename,
              category: d.category,
              sizeBytes: d.sizeBytes,
              blobUrl: d.blobUrl,
              createdAt:
                typeof d.createdAt === "string"
                  ? d.createdAt
                  : new Date(d.createdAt).toISOString(),
            }))}
          />

          <SaTaxYearWorkspace
            baseHref={yearHrefBase}
            activeYear={yearParam ? activeYear : null}
            returns={sa100Returns.map((r) => ({
              id: r.id,
              taxYear: r.taxYear,
              status: r.status,
            }))}
          >
            <Sa100Wizard
              key={`${selected.id}-sa100-${activeYear}`}
              clientId={saClientId}
              clientName={selected.fullName}
              contactEmail={selected.email || client.contactEmail || null}
              utr={selected.utr}
              nino={selected.nino}
              taxpayerId={selected.id}
              companyName={isLimited ? client.name : null}
              taxYear={activeYear}
              initial={{
                ...accumulated,
                phone: selected.phone || accumulated?.phone || "",
                email: selected.email || "",
                dateOfBirth:
                  selected.dateOfBirth || accumulated?.dateOfBirth || "",
              }}
            />
          </SaTaxYearWorkspace>

          {sa100Returns.length > 0 && (
            <section className="panel p-5">
              <h2 className="display text-2xl">
                Filed SA100 returns — {selected.fullName}
              </h2>
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
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <a
                        className="text-sea underline-offset-2 hover:underline"
                        href={`/api/clients/${saClientId}/sa100/${r.id}/sa100.pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        SA100 PDF
                      </a>
                      <EmailToClientButton
                        clientId={saClientId}
                        defaultEmail={
                          selected.email || client.contactEmail || null
                        }
                        compact
                        label="Email SA100"
                        subject={`SA100 — ${selected.fullName}`}
                        message={`Please find attached your Self Assessment return (SA100).\n\nKind regards`}
                        artifact={{
                          type: "sa_pdf",
                          returnId: r.id,
                          doc: "sa100",
                        }}
                      />
                      <a
                        className="text-sea underline-offset-2 hover:underline"
                        href={`/api/clients/${saClientId}/sa100/${r.id}/sa302.pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        SA302 PDF
                      </a>
                      <EmailToClientButton
                        clientId={saClientId}
                        defaultEmail={
                          selected.email || client.contactEmail || null
                        }
                        compact
                        label="Email SA302"
                        subject={`SA302 tax calculation — ${selected.fullName}`}
                        message={`Please find attached your SA302 tax calculation.\n\nKind regards`}
                        artifact={{
                          type: "sa_pdf",
                          returnId: r.id,
                          doc: "sa302",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!isLimited ? (
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="panel p-5">
                <h2 className="display text-2xl">MTD quarterly update</h2>
                <div className="mt-4">
                  <SaFilingForm clientId={clientId} />
                </div>
              </div>
              <div className="panel p-5">
                <h2 className="display text-2xl">Quarterly submissions</h2>
                <ul className="mt-3 divide-y divide-line text-sm">
                  {submissions.length === 0 && (
                    <li className="py-3 text-ink-soft">
                      No quarterly updates yet.
                    </li>
                  )}
                  {submissions.map((s) => (
                    <li key={String(s.id)} className="py-2">
                      <div className="flex justify-between">
                        <span className="font-semibold">
                          {String(s.taxYear)}
                        </span>
                        <span className="badge badge-ok">
                          {String(s.status)}
                        </span>
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
          ) : null}
        </>
      )}
    </div>
  );
}

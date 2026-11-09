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
              taxYear={activeYear}
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
              taxYear={activeYear}
            />
          )}

          <SaTaxYearWorkspace
            baseHref={yearHrefBase}
            activeYear={yearParam ? activeYear : null}
            returns={sa100Returns.map((r) => ({
              id: r.id,
              taxYear: r.taxYear,
              status: r.status,
            }))}
            clientId={saClientId}
            taxpayerId={selected.id}
          >
            <Sa100Wizard
              key={`${selected.id}-sa100-${activeYear}-${selected.updatedAt}-${sa100Draft?.updatedAt ?? "new"}`}
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

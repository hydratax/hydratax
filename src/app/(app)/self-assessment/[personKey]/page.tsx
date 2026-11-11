import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSa100Draft,
  listSa100Returns,
  listSaFiledDocuments,
} from "@/server/actions/sa100";
import {
  getDirectorWorkspace,
  listPracticeDirectors,
} from "@/server/actions/sa-directors";
import { listClientDocuments } from "@/server/actions/documents";
import { getClient } from "@/server/actions/clients";
import { Sa100Wizard } from "@/components/forms/sa100-wizard";
import { SaPersonalBooks } from "@/components/forms/sa-personal-books";
import { SaDirectorIncomeDesk } from "@/components/forms/sa-director-income-desk";
import { SaPersonProfile } from "@/components/forms/sa-person-profile";
import { SaTaxYearWorkspace } from "@/components/forms/sa-tax-year-workspace";
import {
  normalizePersonName,
  roleFromCompanyLinks,
} from "@/lib/sa-taxpayer";
import { accumulateSa100FromIncome } from "@/lib/sa-income";
import { filingSaTaxYear, parseSaTaxYearLabel } from "@/lib/sa-tax-year";
import { requireSession } from "@/server/auth/session";

export default async function PersonSelfAssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ personKey: string }>;
  searchParams?: Promise<{ year?: string }>;
}) {
  await requireSession();
  const { personKey: rawKey } = await params;
  const sp = (await searchParams) ?? {};
  const personKey = decodeURIComponent(rawKey).trim();
  if (!personKey) notFound();

  const filingYear = filingSaTaxYear();
  const yearParam = sp.year?.trim() || "";
  const activeYear =
    (yearParam && parseSaTaxYearLabel(yearParam)?.label) || filingYear.label;

  const directors = await listPracticeDirectors().catch(() => []);
  const person =
    directors.find((d) => d.key === personKey) ||
    directors.find(
      (d) => normalizePersonName(d.fullName) === normalizePersonName(personKey),
    ) ||
    null;
  if (!person) notFound();

  const workspace = await getDirectorWorkspace({
    homeClientId: person.homeClientId,
    personKey: person.key,
  }).catch(() => null);
  if (!workspace?.taxpayer) notFound();

  const selected = workspace.taxpayer;
  const saClientId = workspace.person.homeClientId;
  const homeClient = await getClient(saClientId).catch(() => null);

  const [sa100Draft, sa100Returns, documents, saFiledDocs] = await Promise.all([
    getSa100Draft(saClientId, activeYear, selected.id).catch(() => null),
    listSa100Returns(saClientId, selected.id).catch(() => []),
    listClientDocuments(saClientId).catch(() => []),
    listSaFiledDocuments(saClientId, selected.id).catch(() => []),
  ]);

  const accumulated = accumulateSa100FromIncome(selected, {
    ...(sa100Draft?.draft ?? {}),
    taxYear: activeYear,
  });

  const yearHrefBase = `/self-assessment/${encodeURIComponent(person.key)}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Self Assessment
          </p>
          <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
            {selected.fullName}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Personal SA100 · tax year 6 April to 5 April · file by 31 January
          </p>
        </div>
        <Link href="/clients?desk=sa" className="btn btn-secondary">
          Back to people
        </Link>
      </div>

      <SaPersonProfile
        key={`${selected.id}-profile`}
        clientId={saClientId}
        taxpayer={selected}
        lockedRole={roleFromCompanyLinks({
          directorOf: workspace.person.directorOf,
          shareholderOf: workspace.person.shareholderOf,
        })}
      />

      <SaDirectorIncomeDesk
        key={selected.id}
        homeClientId={workspace.person.homeClientId}
        person={workspace.person}
        initialTaxpayer={workspace.taxpayer}
        taxYear={activeYear}
      />

      <SaTaxYearWorkspace
        baseHref={yearHrefBase}
        activeYear={yearParam ? activeYear : null}
        returns={sa100Returns.map((r) => ({
          id: r.id,
          taxYear: r.taxYear,
          status: r.status,
        }))}
        filedDocs={saFiledDocs}
        clientId={saClientId}
        taxpayerId={selected.id}
      >
        <Sa100Wizard
          key={`${selected.id}-sa100-${activeYear}-${selected.updatedAt}-${sa100Draft?.updatedAt ?? "new"}`}
          clientId={saClientId}
          clientName={selected.fullName}
          contactEmail={selected.email || homeClient?.contactEmail || null}
          utr={selected.utr}
          nino={selected.nino}
          taxpayerId={selected.id}
          companyName={null}
          taxYear={activeYear}
          initial={{
            ...accumulated,
            phone: selected.phone || accumulated?.phone || "",
            email: selected.email || "",
            dateOfBirth: selected.dateOfBirth || accumulated?.dateOfBirth || "",
          }}
        />
      </SaTaxYearWorkspace>

      <SaPersonalBooks
        clientId={saClientId}
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
    </div>
  );
}

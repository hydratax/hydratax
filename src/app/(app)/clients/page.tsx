import Link from "next/link";
import {
  listClients,
  refreshStaleClientsCompaniesHouse,
} from "@/server/actions/clients";
import { ClientsList, type ClientListItem } from "@/components/clients-list";
import { RefreshCompaniesHouseButton } from "@/components/refresh-companies-house-button";
import { SaDirectorsList } from "@/components/sa-directors-list";
import { listPracticeDirectors } from "@/server/actions/sa-directors";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { clientSlugFor } from "@/lib/client-slug";

type Desk = "all" | "sa" | "ct600" | "vat" | "payroll";

const DESK_META: Record<
  Desk,
  { title: string; subtitle: string; empty: string }
> = {
  all: {
    title: "Clients",
    subtitle:
      "Every entity your practice files for — companies and individuals.",
    empty: "No clients yet.",
  },
  sa: {
    title: "Self Assessment",
    subtitle:
      "Individuals — tax year 6 April to 5 April, file online by 31 January. Personal UTR and NINO, not company Corporation Tax.",
    empty: "No Self Assessment people yet.",
  },
  ct600: {
    title: "Companies · Corporation Tax",
    subtitle:
      "Limited companies only — company UTR, CT600 and accounts. Separate from personal Self Assessment.",
    empty: "No limited company clients yet.",
  },
  vat: {
    title: "VAT clients",
    subtitle: "Clients marked VAT-registered for MTD obligations.",
    empty: "No VAT-registered clients yet.",
  },
  payroll: {
    title: "Payroll clients",
    subtitle: "Employers set up for PAYE / RTI.",
    empty: "No employer clients yet.",
  },
};

function parseDesk(raw: string | undefined): Desk {
  if (raw === "sa" || raw === "ct600" || raw === "vat" || raw === "payroll") {
    return raw;
  }
  return "all";
}

function matchesDesk(
  type: string,
  isVatRegistered: boolean,
  isEmployer: boolean,
  desk: Desk,
  vrn?: string | null,
  payeRef?: string | null,
): boolean {
  switch (desk) {
    case "sa":
      return type === "sole_trader" || type === "partnership";
    case "ct600":
      return type === "limited_company";
    case "vat":
      // Flag or VRN on file — every VAT-registered business on the practice.
      return isVatRegistered || Boolean(vrn?.trim());
    case "payroll":
      // Employer flag or PAYE ref — every PAYE-registered business.
      return isEmployer || Boolean(payeRef?.trim());
    default:
      return true;
  }
}

type Props = {
  searchParams: Promise<{
    imported?: string;
    skipped?: string;
    desk?: string;
  }>;
};

export default async function ClientsPage({ searchParams }: Props) {
  const params = await searchParams;
  const imported = params.imported ? Number(params.imported) : 0;
  const skipped = params.skipped ? Number(params.skipped) : 0;
  const desk = parseDesk(params.desk);
  const meta = DESK_META[desk];

  // Skip live CH refresh on desks where Companies House is not the focus.
  if (desk === "all" || desk === "ct600") {
    try {
      await refreshStaleClientsCompaniesHouse({ force: true, limit: 25 });
    } catch (err) {
      console.warn("[clients] CH refresh skipped", err);
    }
  }

  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));

  if (desk === "sa") {
    const { listSa100Returns } = await import("@/server/actions/sa100");
    const { filingSaTaxYear, saFilingUrgency } = await import(
      "@/lib/sa-tax-year"
    );
    const { countEmailsByClientIds } = await import(
      "@/server/actions/client-communications"
    );
    const { normalizeWorkStage } = await import("@/lib/client-work-stage");
    const filingYear = filingSaTaxYear();
    const [directorsRaw, soleBase] = await Promise.all([
      listPracticeDirectors().catch(() => []),
      Promise.resolve(
        clients
          .filter((c) => c.type === "sole_trader" || c.type === "partnership")
          .map((c) => ({
            id: c.id,
            slug: clientSlugFor({ id: c.id, name: c.name }, peers),
            name: c.name,
            type: c.type,
            utr: c.utr,
            nino: c.nino,
            workStage: normalizeWorkStage(c.deskProfile?.workStage),
          })),
      ),
    ]);

    const emailClientIds = [
      ...soleBase.map((c) => c.id),
      ...directorsRaw.map((d) => d.homeClientId),
    ];
    const emailCounts = await countEmailsByClientIds(emailClientIds).catch(
      () => ({} as Record<string, number>),
    );

    const directors = directorsRaw.map((d) => {
      const home = clients.find((c) => c.id === d.homeClientId);
      return {
        ...d,
        workStage: normalizeWorkStage(home?.deskProfile?.workStage),
        emailCount: emailCounts[d.homeClientId] ?? 0,
      };
    });

    const soleTraders = await Promise.all(
      soleBase.map(async (c) => {
        const returns = await listSa100Returns(c.id).catch(() => []);
        const match =
          returns.find((r) => r.taxYear === filingYear.label) ?? null;
        const status = match
          ? match.status === "accepted"
            ? ("accepted" as const)
            : match.status === "submitted"
              ? ("submitted" as const)
              : ("draft" as const)
          : ("none" as const);
        return {
          ...c,
          emailCount: emailCounts[c.id] ?? 0,
          filing: {
            taxYear: filingYear.label,
            filingDue: filingYear.filingDue,
            status,
            urgency: saFilingUrgency(filingYear, status),
          },
        };
      }),
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
              Practice
            </p>
            <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
              {meta.title}
            </h1>
            <p className="mt-1 text-ink-soft">{meta.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/clients/bulk-email?desk=sa"
              className="btn btn-secondary"
            >
              Bulk email
            </Link>
            <Link href="/clients/import" className="btn btn-secondary">
              Import Excel
            </Link>
            <Link href="/clients/new?desk=sa" className="btn btn-primary">
              Add client
            </Link>
          </div>
        </div>

        <SaDirectorsList directors={directors} soleTraders={soleTraders} />
      </div>
    );
  }

  const items: ClientListItem[] = clients
    .filter((c) =>
      matchesDesk(
        c.type,
        c.isVatRegistered,
        c.isEmployer,
        desk,
        c.vrn,
        c.payeRef,
      ),
    )
    .map((c) => ({
      id: c.id,
      slug: clientSlugFor({ id: c.id, name: c.name }, peers),
      name: c.name,
      type: c.type,
      companyNumber: c.companyNumber,
      utr: c.utr,
      vrn: c.vrn,
      isVatRegistered: c.isVatRegistered,
      isEmployer: c.isEmployer,
      companiesHouse:
        ("companiesHouse" in c
          ? (c.companiesHouse as ClientCompaniesHouseSnapshot | null)
          : null) ?? null,
    }));

  const bulkEmailHref =
    desk === "vat" ? "/clients/bulk-email?desk=vat" : "/clients/bulk-email";
  const addClientHref =
    desk === "vat" || desk === "payroll"
      ? `/clients/new?desk=${desk}`
      : "/clients/new";
  const showCompaniesHouseRefresh = desk === "all" || desk === "ct600";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Practice
          </p>
          <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
            {meta.title}
          </h1>
          <p className="mt-1 text-ink-soft">{meta.subtitle}</p>
          {desk !== "all" ? (
            <p className="mt-2 text-sm">
              <Link
                href="/clients"
                className="font-semibold text-sea hover:underline"
              >
                ← All clients
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {showCompaniesHouseRefresh ? <RefreshCompaniesHouseButton /> : null}
          <Link href={bulkEmailHref} className="btn btn-secondary">
            Bulk email
          </Link>
          <Link href="/clients/import" className="btn btn-secondary">
            Import Excel
          </Link>
          <Link href={addClientHref} className="btn btn-primary">
            Add client
          </Link>
        </div>
      </div>

      {(imported > 0 || skipped > 0) && (
        <div className="rounded-lg border border-sea/30 bg-sea/5 px-4 py-3 text-sm text-ink">
          {imported > 0 && (
            <p>
              Imported <strong>{imported}</strong> client
              {imported === 1 ? "" : "s"}.
            </p>
          )}
          {skipped > 0 && (
            <p className={imported > 0 ? "mt-1 text-ink-soft" : undefined}>
              Skipped <strong>{skipped}</strong> row
              {skipped === 1 ? "" : "s"} already in your practice.
            </p>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="panel px-5 py-10 text-center text-sm text-ink-soft">
          {meta.empty}{" "}
          <Link
            href={addClientHref}
            className="font-semibold text-sea hover:underline"
          >
            Add a client
          </Link>
          .
        </div>
      ) : (
        <ClientsList clients={items} />
      )}
    </div>
  );
}

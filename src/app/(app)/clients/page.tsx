import Link from "next/link";
import {
  listClients,
  refreshStaleClientsCompaniesHouse,
} from "@/server/actions/clients";
import { ClientsList, type ClientListItem } from "@/components/clients-list";
import { RefreshCompaniesHouseButton } from "@/components/refresh-companies-house-button";
import { SaDirectorsList } from "@/components/sa-directors-list";
import { PartnershipDeskList } from "@/components/partnership-desk-list";
import { listPracticeDirectors } from "@/server/actions/sa-directors";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { clientSlugFor } from "@/lib/client-slug";
import { canRefreshCompaniesHouse } from "@/lib/access";
import { requireSession } from "@/server/auth/session";

type Desk = "all" | "sa" | "partnership" | "ct600" | "vat" | "payroll";

const DESK_META: Record<
  Desk,
  { title: string; subtitle: string; empty: string }
> = {
  all: {
    title: "Clients",
    subtitle:
      "Self Assessment people and limited company clients for this practice.",
    empty: "No clients yet.",
  },
  sa: {
    title: "Self Assessment",
    subtitle:
      "Individuals — tax year 6 April to 5 April, file online by 31 January. Personal UTR and NINO, not company Corporation Tax.",
    empty: "No Self Assessment people yet.",
  },
  partnership: {
    title: "Partnership return (SA800)",
    subtitle:
      "Partnership clients only — open SA800 stationery. Sole traders and limited companies are on their own desks.",
    empty: "No partnership clients yet.",
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
  if (
    raw === "sa" ||
    raw === "partnership" ||
    raw === "ct600" ||
    raw === "vat" ||
    raw === "payroll"
  ) {
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
    case "partnership":
      return type === "partnership";
    case "ct600":
      return type === "limited_company";
    case "vat":
      return isVatRegistered || Boolean(vrn?.trim());
    case "payroll":
      return isEmployer || Boolean(payeRef?.trim());
    case "all":
      // People live in the SA section; this list is companies (and any leftover entities).
      return type === "limited_company";
    default:
      return true;
  }
}

type ClientRow = Awaited<ReturnType<typeof listClients>>[number];

async function loadSaDeskRows(clients: ClientRow[]) {
  const { listSa100Returns } = await import("@/server/actions/sa100");
  const { filingSaTaxYear, saFilingUrgency } = await import(
    "@/lib/sa-tax-year"
  );
  const { countEmailsByClientIds } = await import(
    "@/server/actions/client-communications"
  );
  const { normalizeWorkStage } = await import("@/lib/client-work-stage");
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
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

  return { directors, soleTraders };
}

type Props = {
  searchParams: Promise<{
    imported?: string;
    skipped?: string;
    desk?: string;
  }>;
};

export default async function ClientsPage({ searchParams }: Props) {
  const session = await requireSession();
  const params = await searchParams;
  const imported = params.imported ? Number(params.imported) : 0;
  const skipped = params.skipped ? Number(params.skipped) : 0;
  const desk = parseDesk(params.desk);
  const meta = DESK_META[desk];
  const showChRefreshButton = canRefreshCompaniesHouse(session);

  // Page load: only refresh *stale* CH snapshots (not force) — see refreshStaleClientsCompaniesHouse.
  if (desk === "all" || desk === "ct600") {
    try {
      await refreshStaleClientsCompaniesHouse({ force: false, limit: 15 });
    } catch (err) {
      console.warn("[clients] CH refresh skipped", err);
    }
  }

  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));

  if (desk === "partnership") {
    const partnerships = clients
      .filter((c) => c.type === "partnership")
      .map((c) => ({
        id: c.id,
        slug: clientSlugFor({ id: c.id, name: c.name }, peers),
        name: c.name,
        utr: c.utr,
      }));
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
            <p className="mt-2 text-sm">
              <Link
                href="/clients"
                className="font-semibold text-sea hover:underline"
              >
                ← All clients
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/clients?desk=sa"
              className="btn btn-secondary text-sm"
            >
              ← Self Assessment
            </Link>
            <Link
              href="/clients/bulk-email?desk=sa"
              className="btn btn-secondary text-sm"
            >
              Bulk email
            </Link>
            <Link href="/clients/import" className="btn btn-secondary text-sm">
              Import Excel
            </Link>
            <Link
              href="/clients/new?desk=partnership"
              className="btn btn-primary text-sm"
            >
              Add partnership
            </Link>
          </div>
        </div>

        {partnerships.length === 0 ? (
          <div className="service-tile px-5 py-10 text-center text-sm text-ink-soft">
            {meta.empty}{" "}
            <Link
              href="/clients/new?desk=partnership"
              className="font-semibold text-sea hover:underline"
            >
              Add a partnership
            </Link>
            .
          </div>
        ) : (
          <PartnershipDeskList partnerships={partnerships} />
        )}
      </div>
    );
  }

  if (desk === "sa") {
    const { directors, soleTraders } = await loadSaDeskRows(clients);
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
            <p className="mt-2 text-sm">
              <Link
                href="/clients"
                className="font-semibold text-sea hover:underline"
              >
                ← All clients
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/clients?desk=partnership"
              className="btn btn-secondary text-sm"
            >
              Partnerships (SA800)
            </Link>
            <Link
              href="/clients/bulk-email?desk=sa"
              className="btn btn-secondary text-sm"
            >
              Bulk email
            </Link>
            <Link href="/clients/import" className="btn btn-secondary text-sm">
              Import Excel
            </Link>
            <Link href="/clients/new?desk=sa" className="btn btn-primary text-sm">
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

  const saDesk =
    desk === "all" ? await loadSaDeskRows(clients).catch(() => null) : null;

  const bulkEmailHref =
    desk === "vat" ? "/clients/bulk-email?desk=vat" : "/clients/bulk-email";
  const addClientHref =
    desk === "vat" || desk === "payroll"
      ? `/clients/new?desk=${desk}`
      : "/clients/new";
  const showCompaniesHouseRefresh =
    showChRefreshButton && (desk === "all" || desk === "ct600");
  const hasSaPeople =
    Boolean(saDesk) &&
    ((saDesk?.directors.length ?? 0) > 0 ||
      (saDesk?.soleTraders.length ?? 0) > 0);

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

      {desk === "all" ? (
        <div className="space-y-10">
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="display text-2xl text-ink">Self Assessment</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  People — directors, shareholders and sole traders.
                </p>
              </div>
              <Link
                href="/clients?desk=sa"
                className="text-sm font-semibold text-sea hover:underline"
              >
                Open SA desk →
              </Link>
            </div>
            {hasSaPeople && saDesk ? (
              <SaDirectorsList
                directors={saDesk.directors}
                soleTraders={saDesk.soleTraders}
              />
            ) : (
              <div className="panel px-5 py-8 text-center text-sm text-ink-soft">
                No Self Assessment people yet.{" "}
                <Link
                  href="/clients/new?desk=sa"
                  className="font-semibold text-sea hover:underline"
                >
                  Add a person
                </Link>
                .
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="display text-2xl text-ink">Companies</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  Limited companies — CT600, accounts and Companies House.
                </p>
              </div>
              <Link
                href="/clients?desk=ct600"
                className="text-sm font-semibold text-sea hover:underline"
              >
                Open CT600 desk →
              </Link>
            </div>
            {items.length === 0 ? (
              <div className="panel px-5 py-8 text-center text-sm text-ink-soft">
                No limited company clients yet.{" "}
                <Link
                  href="/clients/new"
                  className="font-semibold text-sea hover:underline"
                >
                  Add a company
                </Link>
                .
              </div>
            ) : (
              <ClientsList clients={items} openPath="/corporation-tax" />
            )}
          </section>
        </div>
      ) : items.length === 0 ? (
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
        <ClientsList
          clients={items}
          openPath={
            desk === "vat"
              ? "/vat"
              : desk === "payroll"
                ? "/payroll"
                : desk === "ct600"
                  ? "/corporation-tax"
                  : desk === "sa"
                    ? "/self-assessment"
                    : desk === "partnership"
                      ? "/sa800"
                      : ""
          }
        />
      )}
    </div>
  );
}

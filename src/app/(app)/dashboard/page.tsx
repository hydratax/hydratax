import Link from "next/link";
import { listClients } from "@/server/actions/clients";
import { requireSession } from "@/server/auth/session";
import { getHmrcEnvInfo } from "@/server/actions/hmrc-connect";
import { getPracticeEntitlements } from "@/server/actions/account";
import { DashboardClientFilters } from "@/components/dashboard-client-filters";
import { DashboardServiceCard } from "@/components/dashboard-service-card";
import { moduleLabel, type ServiceModule } from "@/lib/entitlements";
import { displayPracticeName } from "@/lib/practice-name";
import { clientSlugFor } from "@/lib/client-slug";

function buildRailLinks(): {
  module: ServiceModule;
  title: string;
  href: string;
  blurb: string;
}[] {
  /** Always the desk list — never deep-link into one client's return. */
  return [
    {
      module: "vat",
      title: "MTD VAT",
      href: "/clients?desk=vat",
      blurb: "VAT clients · then file",
    },
    {
      module: "corporation_tax",
      title: "Companies · CT600",
      href: "/clients?desk=ct600",
      blurb: "Company cards · CT600 & accounts",
    },
    {
      module: "self_assessment",
      title: "Self Assessment",
      href: "/clients?desk=sa",
      blurb: "People, partnerships & personal UTR",
    },
    {
      module: "payroll",
      title: "PAYE / RTI",
      href: "/clients?desk=payroll",
      blurb: "Employers · FPS & EPS",
    },
  ];
}

export default async function DashboardPage() {
  const session = await requireSession();
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const hmrc = await getHmrcEnvInfo();
  const entitlements = await getPracticeEntitlements();
  const unlocked = new Set(entitlements.modules);
  const railLinks = buildRailLinks();

  const { listPracticeDirectors } = await import(
    "@/server/actions/sa-directors"
  );
  const directors = await listPracticeDirectors().catch(() => []);
  const saSoleAndPartners = clients.filter(
    (c) => c.type === "sole_trader" || c.type === "partnership",
  );
  /** People for SA — never count limited company entities as SA clients. */
  const saPeopleCount = directors.length + saSoleAndPartners.length;
  const saPeople = [
    ...directors.map((d) => ({
      key: `dir:${d.key}`,
      fullName: d.fullName,
      href: `/self-assessment/${encodeURIComponent(d.key)}`,
      kind: "director" as const,
      detail:
        d.companies.length === 1
          ? d.companies[0]!.companyName
          : `${d.companies.length} companies`,
    })),
    ...saSoleAndPartners.map((c) => ({
      key: `client:${c.id}`,
      fullName: c.name,
      href: `/clients/${clientSlugFor({ id: c.id, name: c.name }, peers)}/self-assessment`,
      kind:
        c.type === "partnership"
          ? ("partnership" as const)
          : ("sole_trader" as const),
      detail: c.type === "partnership" ? "Partnership" : "Sole trader",
    })),
  ];
  const payeClients = clients.filter(
    (c) => c.isEmployer || Boolean(c.payeRef?.trim()),
  );

  const stats = [
    {
      id: "clients" as const,
      label: "Clients",
      value: String(clients.length),
      hint: "Across your practice",
    },
    {
      id: "vat" as const,
      label: "VAT",
      value: String(clients.filter((c) => c.isVatRegistered).length),
      hint: "Registered VRNs",
    },
    {
      id: "paye" as const,
      label: "PAYE",
      value: String(payeClients.length),
      hint: "Employers on payroll",
    },
    {
      id: "sa" as const,
      label: "Self Assessment",
      value: String(saPeopleCount),
      hint: "Sole traders / directors",
    },
    {
      id: "ltd" as const,
      label: "Ltd companies",
      value: String(clients.filter((c) => c.type === "limited_company").length),
      hint: "CT600 eligible",
    },
  ];

  return (
    <div className="space-y-9">
      <div className="dashboard-hero flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Practice overview
          </p>
          <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
            {displayPracticeName(session.practiceName)}
          </h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            {clients.length} clients · HMRC{" "}
            {hmrc.env === "production" ? "live" : "test"}
            {hmrc.configured
              ? " credentials configured"
              : " · connect credentials in Settings"}
            {entitlements.orgType === "practice"
              ? " · accountancy practice"
              : ""}
            {entitlements.hasAnyPaid ? "" : " · plan not linked yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/clients" className="btn btn-secondary text-sm">
            Clients
          </Link>
          <Link href="/tasks" className="btn btn-secondary text-sm">
            Tasks
          </Link>
        </div>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="display text-2xl text-ink">Your services</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Access follows your active payment plan
              {entitlements.plans.length
                ? ` (${entitlements.plans.map((p) => p.label).join(", ")})`
                : ""}
              .
            </p>
          </div>
        </div>
        <div className="mt-4 grid auto-rows-fr gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {railLinks.map((rail) => {
            const open = unlocked.has(rail.module);
            return (
              <DashboardServiceCard
                key={rail.title}
                href={open ? rail.href : "/pricing#practice"}
                module={rail.module}
                moduleLabel={moduleLabel(rail.module)}
                title={rail.title}
                blurb={rail.blurb}
                locked={!open}
                cta={open ? "Open" : "Try free →"}
                pendingLabel={
                  open ? `Opening ${rail.title}…` : "Opening plans…"
                }
              />
            );
          })}
        </div>
      </section>

      <DashboardClientFilters
        clients={clients.map((c) => ({
          id: c.id,
          slug: clientSlugFor({ id: c.id, name: c.name }, peers),
          name: c.name,
          type: c.type as "sole_trader" | "limited_company" | "partnership",
          isVatRegistered: c.isVatRegistered,
          isEmployer: c.isEmployer,
          vrn: c.vrn,
          utr: c.utr,
          companyNumber: c.companyNumber,
          payeRef: c.payeRef,
          companiesHouse:
            "companiesHouse" in c
              ? (c.companiesHouse as import("@/server/companies-house/enrich-client").ClientCompaniesHouseSnapshot | null)
              : null,
        }))}
        saPeople={saPeople}
        unlockedModules={entitlements.modules}
        stats={stats}
        canAddClients={unlocked.has("clients")}
      />
    </div>
  );
}

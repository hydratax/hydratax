import Link from "next/link";
import { listClients } from "@/server/actions/clients";
import { requireSession } from "@/server/auth/session";
import { isPlatformAdmin } from "@/server/auth/admin";
import { getHmrcEnvInfo } from "@/server/actions/hmrc-connect";
import { getPracticeEntitlements } from "@/server/actions/account";
import { DashboardClientFilters } from "@/components/dashboard-client-filters";
import { DashboardServiceCard } from "@/components/dashboard-service-card";
import { moduleLabel, type ServiceModule } from "@/lib/entitlements";
import { displayPracticeName } from "@/lib/practice-name";
import { clientSlugFor } from "@/lib/client-slug";

const RAIL_LINKS: {
  module: ServiceModule;
  title: string;
  href: string;
  blurb: string;
}[] = [
  {
    module: "clients",
    title: "Clients",
    href: "/clients",
    blurb: "Companies & individuals",
  },
  {
    module: "vat",
    title: "MTD VAT",
    href: "/clients?desk=vat",
    blurb: "Obligations & submit",
  },
  {
    module: "corporation_tax",
    title: "Companies · CT600",
    href: "/clients?desk=ct600",
    blurb: "Company UTR & accounts",
  },
  {
    module: "self_assessment",
    title: "Self Assessment",
    href: "/clients?desk=sa",
    blurb: "People · personal UTR",
  },
  {
    module: "payroll",
    title: "PAYE / RTI",
    href: "/clients?desk=payroll",
    blurb: "FPS & EPS",
  },
  {
    module: "companies_house",
    title: "Companies House",
    href: "/companies-house",
    blurb: "Filings & personal codes",
  },
];

export default async function DashboardPage() {
  const session = await requireSession();
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const hmrc = await getHmrcEnvInfo();
  const entitlements = await getPracticeEntitlements();
  const unlocked = new Set(entitlements.modules);

  const stats = [
    {
      id: "clients" as const,
      label: "Clients",
      value: String(clients.length),
      hint: "Across your practice",
    },
    {
      id: "vat" as const,
      label: "VAT-ready",
      value: String(clients.filter((c) => c.isVatRegistered).length),
      hint: "Registered VRNs",
    },
    {
      id: "rails" as const,
      label: "Plan rails",
      value: String(entitlements.modules.length),
      hint: entitlements.hasAnyPaid ? "Unlocked by payment" : "Choose a plan",
    },
    {
      id: "ltd" as const,
      label: "Ltd companies",
      value: String(clients.filter((c) => c.type === "limited_company").length),
      hint: "CT600 eligible",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
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
            {entitlements.hasAnyPaid
              ? ""
              : " · plan not linked yet"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/pricing" className="btn btn-secondary text-sm">
            Plans & billing
          </Link>
          {isPlatformAdmin(session.email) && (
            <Link href="/admin" className="btn btn-secondary text-sm">
              Admin
            </Link>
          )}
          <Link href="/settings/hmrc" className="btn btn-secondary text-sm">
            HMRC settings
          </Link>
        </div>
      </div>

      <section>
        <h2 className="display text-2xl text-ink">Your services</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Access follows your active payment plan
          {entitlements.plans.length
            ? ` (${entitlements.plans.map((p) => p.label).join(", ")})`
            : ""}
          .
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RAIL_LINKS.map((rail) => {
            const open = unlocked.has(rail.module);
            return (
              <DashboardServiceCard
                key={rail.module}
                href={open ? rail.href : "/pricing#practice"}
                moduleLabel={moduleLabel(rail.module)}
                title={rail.title}
                blurb={rail.blurb}
                locked={!open}
                cta={open ? "Open" : "Try Practice free →"}
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
          type: c.type,
          isVatRegistered: c.isVatRegistered,
          isEmployer: c.isEmployer,
          vrn: c.vrn,
          companyNumber: c.companyNumber,
        }))}
        unlockedModules={entitlements.modules}
        stats={stats}
        canAddClients={unlocked.has("clients")}
      />
    </div>
  );
}

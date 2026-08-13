import Link from "next/link";
import { listClients } from "@/server/actions/clients";
import { requireSession } from "@/server/auth/session";
import { isPlatformAdmin } from "@/server/auth/admin";
import { getHmrcEnvInfo } from "@/server/actions/hmrc-connect";
import { getPracticeEntitlements } from "@/server/actions/account";
import { getPracticeTrialStatus } from "@/server/billing/trial-status";
import { DashboardClientList } from "@/components/dashboard-client-list";
import { ClaimFreeTrialButton } from "@/components/claim-free-trial-button";
import { moduleLabel, type ServiceModule } from "@/lib/entitlements";
import { displayPracticeName } from "@/lib/practice-name";
import { PRACTICE_TRIAL_DAYS } from "@/lib/trial";

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
    blurb: "Multi-client practice desk",
  },
  {
    module: "vat",
    title: "MTD VAT",
    href: "/clients",
    blurb: "Obligations & submit",
  },
  {
    module: "corporation_tax",
    title: "CT600",
    href: "/clients",
    blurb: "Corporation Tax XML",
  },
  {
    module: "self_assessment",
    title: "Self Assessment",
    href: "/clients",
    blurb: "ITSA quarterly updates",
  },
  {
    module: "payroll",
    title: "PAYE / RTI",
    href: "/clients",
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
  const hmrc = await getHmrcEnvInfo();
  const entitlements = await getPracticeEntitlements();
  const trial = await getPracticeTrialStatus(session.practiceId);
  const unlocked = new Set(entitlements.modules);

  const trialEndsLabel = trial.trialEndsAt
    ? new Date(trial.trialEndsAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const stats = [
    ["Clients", String(clients.length), "Across your practice"],
    [
      "VAT-ready",
      String(clients.filter((c) => c.isVatRegistered).length),
      "Registered VRNs",
    ],
    [
      "Plan rails",
      String(entitlements.modules.length),
      entitlements.hasAnyPaid ? "Unlocked by payment" : "Choose a plan",
    ],
    [
      "Ltd companies",
      String(clients.filter((c) => c.type === "limited_company").length),
      "CT600 eligible",
    ],
  ] as const;

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

      {trial.onTrial && (
        <aside className="panel border-sea/40 bg-sea/5 p-5">
          <p className="font-semibold text-ink">
            {PRACTICE_TRIAL_DAYS}-day free trial active
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            No Hydra fees and free submissions until
            {trialEndsLabel ? ` ${trialEndsLabel}` : " your trial ends"}.
            Companies House statutory fees still apply where charged. Add a paid
            plan before the trial ends to keep filing without interruption.
          </p>
          <Link href="/pricing" className="btn btn-secondary mt-4 text-sm">
            Choose plan after trial
          </Link>
        </aside>
      )}

      {!entitlements.hasAnyPaid && (
        <aside className="panel border-accent/40 bg-accent/5 p-5">
          <p className="font-semibold text-ink">Unlock Practice or Custom features</p>
          <p className="mt-1 text-sm text-ink-soft">
            Multi-client desk, CT600, VAT, PAYE and more unlock with a Practice
            or Custom plan. Start a 7-day free trial (card saved now — first
            charge on day 8), or choose Solo / other modules on pricing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ClaimFreeTrialButton />
            <Link href="/pricing" className="btn btn-secondary text-sm">
              View all plans
            </Link>
          </div>
        </aside>
      )}

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
              <div
                key={rail.module}
                className={`panel relative p-4 ${
                  open ? "panel-interactive" : "opacity-75"
                }`}
              >
                {!open && (
                  <span className="badge badge-muted absolute right-3 top-3">
                    Locked
                  </span>
                )}
                <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                  {moduleLabel(rail.module)}
                </p>
                <p className="display mt-1 text-xl text-ink">{rail.title}</p>
                <p className="mt-1 text-sm text-ink-soft">{rail.blurb}</p>
                {open ? (
                  <Link
                    href={rail.href}
                    className="mt-3 inline-block text-sm font-semibold text-sea"
                  >
                    Open →
                  </Link>
                ) : (
                  <Link
                    href="/pricing#practice"
                    className="mt-3 inline-block text-sm font-semibold text-accent"
                  >
                    Try Practice free →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {stats.map(([label, value, hint]) => (
          <div key={label} className="panel panel-interactive p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {label}
            </p>
            <p className="display mt-2 text-3xl text-ink">{value}</p>
            <p className="mt-1 text-xs text-ink-soft">{hint}</p>
          </div>
        ))}
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="display text-2xl text-ink">Get started</h2>
            <p className="text-sm text-ink-soft">
              Add clients, upload documents, connect HMRC, then file
            </p>
          </div>
        </div>
        {clients.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-semibold text-ink">No clients yet</p>
            <p className="mt-1 text-sm text-ink-soft">
              {unlocked.has("clients")
                ? "Add your first client to start books and filings."
                : "Purchase a plan that includes clients, then add entities here."}
            </p>
            <Link
              href={unlocked.has("clients") ? "/clients/new" : "/pricing"}
              className="btn btn-primary mt-4 text-sm"
            >
              {unlocked.has("clients") ? "Add client" : "Choose a plan"}
            </Link>
          </div>
        ) : (
          <div className="p-5">
            <DashboardClientList
              clients={clients.map((c) => ({
                id: c.id,
                name: c.name,
                type: c.type,
                isVatRegistered: c.isVatRegistered,
                isEmployer: c.isEmployer,
                vrn: c.vrn,
                companyNumber: c.companyNumber,
              }))}
            />
          </div>
        )}
      </section>
    </div>
  );
}

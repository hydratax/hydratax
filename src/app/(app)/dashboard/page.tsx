import Link from "next/link";
import { listClients } from "@/server/actions/clients";
import { requireSession } from "@/server/auth/session";
import { isPlatformAdmin } from "@/server/auth/admin";
import { getHmrcEnvInfo } from "@/server/actions/hmrc-connect";
import { getPracticeEntitlements } from "@/server/actions/account";
import { getPracticeTrialStatus } from "@/server/billing/trial-status";
import { DashboardClientFilters } from "@/components/dashboard-client-filters";
import { ClaimFreeTrialButton } from "@/components/claim-free-trial-button";
import { PendingLink } from "@/components/pending-link";
import { moduleLabel, type ServiceModule } from "@/lib/entitlements";
import { displayPracticeName } from "@/lib/practice-name";
import { PRACTICE_TRIAL_DAYS } from "@/lib/trial";
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
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
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

      {trial.onTrial && entitlements.hasAnyPaid && (
        <aside className="panel border-sea/40 bg-sea/5 p-5">
          <p className="font-semibold text-ink">
            {entitlements.plans[0]?.label ?? "Your plan"} —{" "}
            {PRACTICE_TRIAL_DAYS}-day trial
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            You&apos;re already on this plan. No Hydra fees and free submissions
            until
            {trialEndsLabel ? ` ${trialEndsLabel}` : " your trial ends"}
            ; billing continues automatically after that. Companies House
            statutory fees still apply where charged.
          </p>
          <Link href="/settings/account" className="btn btn-secondary mt-4 text-sm">
            Manage billing
          </Link>
        </aside>
      )}

      {trial.onTrial && !entitlements.hasAnyPaid && (
        <aside className="panel border-sea/40 bg-sea/5 p-5">
          <p className="font-semibold text-ink">
            {PRACTICE_TRIAL_DAYS}-day free trial active
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            No Hydra fees and free submissions until
            {trialEndsLabel ? ` ${trialEndsLabel}` : " your trial ends"}.
            Companies House statutory fees still apply where charged. Choose a
            plan before the trial ends to keep filing without interruption.
          </p>
          <Link href="/pricing" className="btn btn-secondary mt-4 text-sm">
            Choose a plan
          </Link>
        </aside>
      )}

      {!entitlements.hasAnyPaid && !trial.onTrial && (
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
            if (open) {
              return (
                <PendingLink
                  key={rail.module}
                  href={rail.href}
                  className="panel panel-interactive relative block p-4"
                  pendingLabel={`Opening ${rail.title}…`}
                >
                  {(pending) => (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                            {moduleLabel(rail.module)}
                          </p>
                          <p className="display mt-1 text-xl text-ink">
                            {rail.title}
                          </p>
                          <p className="mt-1 text-sm text-ink-soft">
                            {rail.blurb}
                          </p>
                        </div>
                        <span
                          className={`open-chip shrink-0 ${pending ? "is-pending" : ""}`}
                        >
                          {pending ? "Opening…" : "Open"}
                        </span>
                      </div>
                    </>
                  )}
                </PendingLink>
              );
            }
            return (
              <PendingLink
                key={rail.module}
                href="/pricing#practice"
                className="panel panel-interactive relative block p-4 opacity-90"
                pendingLabel="Opening plans…"
              >
                {(pending) => (
                  <>
                    <span className="badge badge-muted absolute right-3 top-3">
                      Locked
                    </span>
                    <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
                      {moduleLabel(rail.module)}
                    </p>
                    <p className="display mt-1 text-xl text-ink">{rail.title}</p>
                    <p className="mt-1 text-sm text-ink-soft">{rail.blurb}</p>
                    <span
                      className={`mt-3 inline-flex open-chip ${pending ? "is-pending" : ""}`}
                    >
                      {pending ? "Opening…" : "Try Practice free →"}
                    </span>
                  </>
                )}
              </PendingLink>
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

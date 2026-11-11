import Link from "next/link";
import { notFound } from "next/navigation";
import { getChService } from "@/lib/ch-services";
import { ChRequestForm } from "@/components/forms/ch-request-form";
import { IncorporationWizard } from "@/components/forms/incorporation-wizard";
import { ConfirmationStatementCheckout } from "@/components/forms/confirmation-statement-checkout";
import { AnnualAccountsWizard } from "@/components/forms/annual-accounts-wizard";
import { ChangeOfNameWizard } from "@/components/forms/change-of-name-wizard";
import { DirectorChangeWizard } from "@/components/forms/director-change-wizard";
import { PscChangeWizard } from "@/components/forms/psc-change-wizard";
import { ShareAllotmentWizard } from "@/components/forms/share-allotment-wizard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FaqSection } from "@/components/faq-section";
import { faqsForChService } from "@/lib/product-faqs";
import { CompanySearchPanel } from "@/components/companies-house/company-search-panel";
import { getIncorporationFilingReadiness } from "@/server/companies-house/filing/incorporation";
import { getOptionalSession } from "@/server/auth/session";
import { sanitizePublicChFormDefaults } from "@/lib/ch-public-form-defaults";
import { getPracticeCompanyAuthCode } from "@/server/actions/clients";

const WIZARD_SERVICE_IDS = [
  "incorporation",
  "incorporation-same-day",
  "confirmation-statement",
  "accounts-ixbrl",
  "change-of-name",
  "change-of-name-same-day",
  "appoint-director",
  "resign-director",
  "notify-psc",
  "change-psc",
  "cease-psc",
  "return-of-allotment",
  "dissolve-company",
] as const;

export function generateStaticParams() {
  return WIZARD_SERVICE_IDS.map((serviceId) => ({ serviceId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const service = getChService(serviceId);
  if (!service) return { title: "Companies House service" };
  return {
    title: `${service.title} — Companies House via HydraTax`,
    description: service.summary,
  };
}

function ChServiceWizard({
  serviceId,
  service,
  formDefaults,
}: {
  serviceId: string;
  service: NonNullable<ReturnType<typeof getChService>>;
  formDefaults: Record<string, string>;
}) {
  switch (serviceId) {
    case "accounts-ixbrl":
      return <AnnualAccountsWizard service={service} defaults={formDefaults} />;
    case "incorporation":
    case "incorporation-same-day": {
      const readiness = getIncorporationFilingReadiness();
      if (!readiness) return null;
      return (
        <IncorporationWizard
          service={service}
          sameDay={serviceId === "incorporation-same-day"}
          readiness={readiness}
        />
      );
    }
    case "confirmation-statement":
      return (
        <ConfirmationStatementCheckout service={service} defaults={formDefaults} />
      );
    case "change-of-name":
      return (
        <>
          <ChangeOfNameWizard service={service} defaults={formDefaults} />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
      );
    case "change-of-name-same-day":
      return (
        <>
          <ChangeOfNameWizard
            service={service}
            defaults={formDefaults}
            sameDay
          />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
      );
    case "appoint-director":
      return (
        <>
          <DirectorChangeWizard
            service={service}
            defaults={formDefaults}
            mode="appoint"
          />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
      );
    case "resign-director":
      return (
        <>
          <DirectorChangeWizard
            service={service}
            defaults={formDefaults}
            mode="resign"
          />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
      );
    case "notify-psc":
      return (
        <>
          <PscChangeWizard
            service={service}
            defaults={formDefaults}
            mode="notify"
          />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
      );
    case "change-psc":
      return (
        <>
          <PscChangeWizard
            service={service}
            defaults={formDefaults}
            mode="change"
          />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
      );
    case "cease-psc":
      return (
        <>
          <PscChangeWizard
            service={service}
            defaults={formDefaults}
            mode="cease"
          />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
      );
    case "return-of-allotment":
      return (
        <>
          <ShareAllotmentWizard service={service} defaults={formDefaults} />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
      );
    default:
      return null;
  }
}

export default async function ChServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{
    company?: string;
    clientId?: string;
    name?: string;
    pay?: string;
    resume?: string;
    mode?: string;
    step?: string;
  }>;
}) {
  const { serviceId } = await params;
  const query = await searchParams;
  const service = getChService(serviceId);
  if (!service) notFound();
  const session = await getOptionalSession();
  const formDefaults = sanitizePublicChFormDefaults(query, {
    signedIn: Boolean(session),
  });

  if (session && (formDefaults.clientId || formDefaults.companyNumber)) {
    const savedAuth = await getPracticeCompanyAuthCode({
      clientId: formDefaults.clientId,
      companyNumber: formDefaults.companyNumber,
    });
    if (savedAuth) {
      formDefaults.companyAuthCode = savedAuth;
    }
  }

  const isCs01 = serviceId === "confirmation-statement";
  const hubCheckout = isCs01 && Boolean(formDefaults.companyNumber);
  const usesDedicatedWizard =
    serviceId !== "dissolve-company" &&
    WIZARD_SERVICE_IDS.includes(serviceId as (typeof WIZARD_SERVICE_IDS)[number]);

  const isIncorporation =
    serviceId === "incorporation" || serviceId === "incorporation-same-day";

  return (
    <div className="min-h-screen company-profile">
      <SiteHeader />

      <main>
        {usesDedicatedWizard ? (
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
            {!hubCheckout && (
              <nav className="mb-6 text-sm text-ink-soft">
                <Link href="/" className="font-semibold text-sea hover:underline">
                  Home
                </Link>
                <span className="mx-2 text-line">/</span>
                <Link
                  href="/companies-house"
                  className="font-semibold text-sea hover:underline"
                >
                  Companies House
                </Link>
                <span className="mx-2 text-line">/</span>
                <span className="text-ink">{service.title}</span>
              </nav>
            )}
            <ChServiceWizard
              serviceId={serviceId}
              service={service}
              formDefaults={formDefaults}
            />
          </div>
        ) : (
          <>
            {!hubCheckout && (
              <header className="company-profile-hero relative overflow-hidden border-b border-line/70">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.32]"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(15,118,110,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,0.055) 1px, transparent 1px)",
                    backgroundSize: "48px 48px",
                    maskImage:
                      "radial-gradient(ellipse 80% 70% at 50% 0%, black, transparent)",
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse 70% 55% at 50% 28%, rgba(15,118,110,0.14), transparent 58%), linear-gradient(165deg, #f4fbfa 0%, #f7f9fa 45%, #eef7f6 100%)",
                  }}
                />
                <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-8 md:px-6 md:pb-12 md:pt-10">
                  <nav className="text-sm text-ink-soft">
                    <Link
                      href="/"
                      className="font-semibold text-sea hover:underline"
                    >
                      Home
                    </Link>
                    <span className="mx-2 text-line">/</span>
                    <Link
                      href="/companies-house"
                      className="font-semibold text-sea hover:underline"
                    >
                      Companies House
                    </Link>
                    <span className="mx-2 text-line">/</span>
                    <span className="text-ink">{service.title}</span>
                  </nav>
                  <div className="company-profile-hero-copy mt-8 max-w-3xl">
                    <p className="gloss-badge inline-flex rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
                      {service.channel} · Companies House
                    </p>
                    <h1 className="display mt-4 text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.08] tracking-tight text-ink">
                      {service.title}
                    </h1>
                    <p className="mt-4 max-w-2xl text-base text-ink-soft">
                      {service.summary}
                    </p>
                  </div>
                </div>
              </header>
            )}

            <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-6">
                  <div className="gloss-shine" aria-hidden />
                  <h2 className="display relative text-2xl text-ink">
                    What you need
                  </h2>
                  <ul className="relative mt-4 space-y-3">
                    {service.whatYouNeed.map((item) => (
                      <li
                        key={item}
                        className="border-b border-line/70 pb-3 text-sm text-ink-soft last:border-b-0 last:pb-0"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <ChRequestForm service={service} defaults={formDefaults} />
              </div>

              {!isIncorporation && (
                <div className="mt-12 gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 md:p-6">
                  <div className="gloss-shine" aria-hidden />
                  <div className="relative">
                    <CompanySearchPanel variant="embedded" />
                  </div>
                </div>
              )}

              <FaqSection items={faqsForChService(service.id)} />
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

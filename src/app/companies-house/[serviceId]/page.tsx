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
        <>
          <IncorporationWizard
            service={service}
            sameDay={serviceId === "incorporation-same-day"}
            readiness={readiness}
          />
          <div className="mt-12">
            <FaqSection items={faqsForChService(service.id)} />
          </div>
        </>
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

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {usesDedicatedWizard ? (
          <ChServiceWizard
            serviceId={serviceId}
            service={service}
            formDefaults={formDefaults}
          />
        ) : (
          <>
            {!hubCheckout && (
              <>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
                  Companies House · {service.channel}
                </p>
                <h1 className="display mt-2 text-3xl text-ink sm:text-4xl md:text-5xl">
                  {service.title}
                </h1>
                <p className="mt-3 max-w-3xl text-ink-soft">{service.summary}</p>
              </>
            )}

            <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="space-y-6">
                <div className="panel p-5">
                  <h2 className="display text-2xl">What you need</h2>
                  <ul className="mt-3 space-y-2 text-sm text-ink-soft">
                    {service.whatYouNeed.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="text-sea">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <ChRequestForm service={service} defaults={formDefaults} />
            </div>

            <div className="mt-12">
              <CompanySearchPanel />
            </div>

            <FaqSection items={faqsForChService(service.id)} />
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

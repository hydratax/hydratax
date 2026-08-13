import { notFound } from "next/navigation";
import { getChService, formatChFeeBreakdown } from "@/lib/ch-services";
import { ChRequestForm } from "@/components/forms/ch-request-form";
import { IncorporationWizard } from "@/components/forms/incorporation-wizard";
import { ConfirmationStatementCheckout } from "@/components/forms/confirmation-statement-checkout";
import { AnnualAccountsWizard } from "@/components/forms/annual-accounts-wizard";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { FaqSection } from "@/components/faq-section";
import { faqsForChService } from "@/lib/product-faqs";
import { CompanySearchPanel } from "@/components/companies-house/company-search-panel";
import { getIncorporationFilingReadiness } from "@/server/companies-house/filing/incorporation";

export function generateStaticParams() {
  return [
    { serviceId: "incorporation" },
    { serviceId: "incorporation-same-day" },
    { serviceId: "confirmation-statement" },
    { serviceId: "accounts-ixbrl" },
    { serviceId: "change-of-name" },
    { serviceId: "change-of-name-same-day" },
    { serviceId: "appoint-director" },
    { serviceId: "resign-director" },
    { serviceId: "dissolve-company" },
  ];
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
  const fees = formatChFeeBreakdown(service);
  const formDefaults: Record<string, string> = {};
  if (query.company) {
    formDefaults.companyNumber = query.company.toUpperCase();
    formDefaults.company_number = query.company.toUpperCase();
  }
  if (query.clientId) formDefaults.clientId = query.clientId;
  if (query.name) {
    formDefaults.currentName = query.name;
    formDefaults.companyName = query.name;
  }
  if (query.pay) formDefaults.pay = query.pay;
  if (query.resume) formDefaults.resume = query.resume;
  if (query.mode) formDefaults.mode = query.mode;
  if (query.step) formDefaults.step = query.step;

  const isCs01 = serviceId === "confirmation-statement";
  const isAccounts = serviceId === "accounts-ixbrl";
  const isIn01 =
    serviceId === "incorporation" || serviceId === "incorporation-same-day";
  const hubCheckout = isCs01 && Boolean(formDefaults.companyNumber);
  const incorporationReadiness = isIn01
    ? getIncorporationFilingReadiness()
    : null;

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
        {isAccounts ? (
          <AnnualAccountsWizard service={service} defaults={formDefaults} />
        ) : isIn01 && incorporationReadiness ? (
          <>
            <IncorporationWizard
              service={service}
              sameDay={serviceId === "incorporation-same-day"}
              readiness={incorporationReadiness}
            />
            <div className="mt-12">
              <FaqSection items={faqsForChService(service.id)} />
            </div>
          </>
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
                {!isCs01 && (
                  <p className="mt-3 max-w-3xl text-ink-soft">{service.summary}</p>
                )}
              </>
            )}

            {isCs01 ? (
              <div className={hubCheckout ? "" : "mt-10"}>
                <ConfirmationStatementCheckout
                  service={service}
                  defaults={formDefaults}
                />
              </div>
            ) : (
              <>
                <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="space-y-6">
                    <div className="panel p-5">
                      <h2 className="display text-2xl">Fees</h2>
                      <dl className="mt-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-ink-soft">
                            Companies House (statutory)
                          </dt>
                          <dd className="price-amount text-2xl">
                            {fees.statutory}
                          </dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-ink-soft">Hydra service</dt>
                          <dd className="font-semibold">{fees.hydra}</dd>
                        </div>
                        <div className="flex justify-between border-t border-line pt-2">
                          <dt className="font-semibold text-ink">You pay</dt>
                          <dd className="price-amount text-3xl">{fees.total}</dd>
                        </div>
                      </dl>
                    </div>

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
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

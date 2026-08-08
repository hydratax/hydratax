import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  CH_FEE_SOURCE,
  CH_GUIDANCE,
  getChService,
  formatChFeeBreakdown,
} from "@/lib/ch-services";
import { ChRequestForm } from "@/components/forms/ch-request-form";
import { ConfirmationStatementWizard } from "@/components/forms/confirmation-statement-wizard";
import { SiteFooter } from "@/components/site-footer";
import { FaqSection } from "@/components/faq-section";
import { faqsForChService } from "@/lib/product-faqs";
import { CompanySearchPanel } from "@/components/companies-house/company-search-panel";
import { getCsFilingReadiness } from "@/server/companies-house/filing/confirmation-statement";

export function generateStaticParams() {
  return [
    { serviceId: "incorporation" },
    { serviceId: "incorporation-same-day" },
    { serviceId: "confirmation-statement" },
    { serviceId: "accounts-ixbrl" },
    { serviceId: "change-of-name" },
    { serviceId: "change-of-name-same-day" },
    { serviceId: "voluntary-strike-off" },
    { serviceId: "registration-of-charge" },
    { serviceId: "certificate-incorporation" },
    { serviceId: "certified-copy" },
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
  searchParams: Promise<{ company?: string; clientId?: string }>;
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
  const csReadiness =
    serviceId === "confirmation-statement" ? getCsFilingReadiness() : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/brand/logo.png" alt="HydraTax" width={32} height={32} />
            <span className="display text-lg font-semibold text-ink">
              HydraTax
            </span>
          </Link>
          <nav className="flex gap-3 text-sm font-semibold">
            <Link href="/companies-house" className="text-ink-soft hover:text-ink">
              All CH services
            </Link>
            <Link
              href="/companies-house/personal-code"
              className="text-ink-soft hover:text-ink"
            >
              Personal codes
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Companies House · {service.channel}
        </p>
        <h1 className="display mt-2 text-4xl text-ink md:text-5xl">
          {service.title}
        </h1>
        <p className="mt-3 max-w-3xl text-ink-soft">{service.summary}</p>

        <aside className="mt-6 rounded-xl border border-sea/20 bg-sea/5 px-4 py-3 text-sm text-ink-soft">
          Statutory fees and rules are published by Companies House on GOV.UK.{" "}
          <a
            href={CH_FEE_SOURCE.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sea"
          >
            {CH_FEE_SOURCE.title}
          </a>
          . {CH_FEE_SOURCE.note}
        </aside>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="panel p-5">
              <h2 className="display text-2xl">Fees</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Companies House (statutory)</dt>
                  <dd className="price-amount text-2xl">{fees.statutory}</dd>
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

            <div className="panel p-5">
              <h2 className="display text-2xl">Important notes</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-soft">
                {service.importantNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>

            {service.requiresPersonalCodes && (
              <div className="panel border-accent/30 p-5">
                <h2 className="display text-2xl text-ink">
                  Director personal codes
                </h2>
                <p className="mt-2 text-sm text-ink-soft">
                  HydraTax cannot issue Companies House personal codes inside
                  this website. Identity verification must go through{" "}
                  <a
                    href={CH_GUIDANCE.verifyIdentity}
                    className="font-semibold text-sea"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GOV.UK One Login
                  </a>{" "}
                  or an Authorised Corporate Service Provider (ACSP). See{" "}
                  <Link
                    href="/companies-house/personal-code"
                    className="font-semibold text-sea"
                  >
                    how personal codes work
                  </Link>
                  .
                </p>
              </div>
            )}

            <div className="panel p-5">
              <h2 className="display text-2xl">Official Companies House links</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {service.govUkLinks.map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sea"
                    >
                      {l.label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {serviceId === "confirmation-statement" && csReadiness ? (
            <div className="space-y-6">
              <ConfirmationStatementWizard
                defaults={formDefaults}
                readiness={csReadiness}
              />
              <details className="rounded-xl border border-line bg-white p-4 text-sm">
                <summary className="cursor-pointer font-semibold text-ink">
                  Or queue a paid filing request (checkout)
                </summary>
                <div className="mt-4">
                  <ChRequestForm service={service} defaults={formDefaults} />
                </div>
              </details>
            </div>
          ) : (
            <ChRequestForm service={service} defaults={formDefaults} />
          )}
        </div>

        <div className="mt-12">
          <CompanySearchPanel />
        </div>

        <FaqSection items={faqsForChService(service.id)} />
      </main>

      <SiteFooter />
    </div>
  );
}

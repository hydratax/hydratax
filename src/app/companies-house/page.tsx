import Link from "next/link";
import {
  CH_SERVICE_DETAILS,
  formatChFeeBreakdown,
} from "@/lib/ch-services";
import { SiteFooter } from "@/components/site-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { CompanySearchPanel } from "@/components/companies-house/company-search-panel";
import { FaqSection } from "@/components/faq-section";
import { faqsForProduct } from "@/lib/product-faqs";

export const metadata = {
  title:
    "Companies House filing — confirmation statement, accounts & incorporation",
  description:
    "File a Companies House confirmation statement, iXBRL annual accounts or UK company incorporation with HydraTax. Statutory CH fees plus a flat Hydra service charge.",
  keywords: [
    "file confirmation statement",
    "Companies House filing software",
    "CS01 online",
    "file annual accounts Companies House",
    "company incorporation UK",
    "iXBRL accounts filing",
  ],
  alternates: { canonical: "/companies-house" },
};

export default function CompaniesHousePage() {
  const popular = CH_SERVICE_DETAILS.filter((s) => s.popular);

  return (
    <div className="min-h-screen">
      <LandingHeader />

      <main>
        <section className="relative overflow-visible bg-ink px-4 pb-14 pt-32 text-white sm:pb-16 sm:pt-36 md:px-6 md:pb-20 md:pt-40">
          <div className="relative mx-auto max-w-2xl">
            <CompanySearchPanel
              variant="hero"
              heading="Find your company"
              description={null}
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
          <h2 className="display text-2xl text-ink sm:text-3xl">Most requested</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            {popular.map((s) => {
              const fees = formatChFeeBreakdown(s);
              return (
                <Link
                  key={s.id}
                  href={`/companies-house/${s.id}`}
                  className="gloss-card panel block p-5 transition hover:-translate-y-1"
                >
                  <p className="badge badge-sea w-fit">{s.channel}</p>
                  <h3 className="display mt-3 text-xl text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm text-ink-soft">{s.summary}</p>
                  <p className="price-figure mt-4">
                    <span className="price-amount text-3xl">{fees.total}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">
                    CH {fees.statutory} + Hydra {fees.hydra}
                  </p>
                  <span className="mt-4 inline-block text-sm font-semibold text-sea">
                    View details & request →
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border-t border-line bg-white/70">
          <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
            <h2 className="display text-2xl text-ink sm:text-3xl md:text-4xl">
              Full Companies House service list
            </h2>
            <p className="mt-2 max-w-2xl text-ink-soft">
              Select a service for Companies House requirements, official GOV.UK
              links, and a custom request form.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {CH_SERVICE_DETAILS.map((s) => {
                const fees = formatChFeeBreakdown(s);
                return (
                  <Link
                    key={s.id}
                    href={`/companies-house/${s.id}`}
                    className="panel flex items-start justify-between gap-4 p-4 transition hover:border-sea"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{s.title}</p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {s.channel} · CH {fees.statutory} + Hydra {fees.hydra}
                      </p>
                    </div>
                    <span className="price-amount shrink-0 text-xl sm:text-2xl">
                      {fees.total}
                    </span>
                  </Link>
                );
              })}
            </div>

            <FaqSection
              title="Companies House FAQs"
              items={faqsForProduct("companies-house")}
            />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

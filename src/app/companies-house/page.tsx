import Link from "next/link";
import Image from "next/image";
import {
  CH_FEE_SOURCE,
  CH_SERVICE_DETAILS,
  formatChFeeBreakdown,
} from "@/lib/ch-services";
import { HYDRA_SERVICE_FEE_POUNDS } from "@/lib/pricing";
import { SiteFooter } from "@/components/site-footer";
import { CompanySearchPanel } from "@/components/companies-house/company-search-panel";
import { FaqSection } from "@/components/faq-section";
import { faqsForProduct } from "@/lib/product-faqs";

export const metadata = {
  title:
    "Companies House Services — Confirmation Statement, Accounts, Incorporation",
  description:
    "File Companies House confirmation statements, iXBRL accounts, incorporation and more with HydraTax. Fees from the official GOV.UK Companies House schedule plus Hydra service charge.",
};

export default function CompaniesHousePage() {
  const popular = CH_SERVICE_DETAILS.filter((s) => s.popular);

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
          <nav className="flex items-center gap-3 text-sm font-semibold">
            <Link
              href="/companies-house/personal-code"
              className="text-ink-soft hover:text-ink"
            >
              Personal codes
            </Link>
            <Link href="/pricing" className="text-ink-soft hover:text-ink">
              Pricing
            </Link>
            <Link href="/create-account" className="btn btn-primary text-sm">
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-ink px-4 py-16 text-white md:px-6 md:py-20">
          <div className="relative mx-auto max-w-6xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-300/80">
              Companies House
            </p>
            <h1 className="display mt-3 max-w-3xl text-4xl md:text-6xl">
              Companies House filings — priced transparently
            </h1>
            <p className="mt-4 max-w-2xl text-white/65">
              Statutory fees from the official Companies House schedule, plus a
              flat £{HYDRA_SERVICE_FEE_POUNDS} Hydra service charge. Each
              service has its own guidance and request form.
            </p>
            <aside className="mt-6 max-w-2xl rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/75">
              Fee source:{" "}
              <a
                href={CH_FEE_SOURCE.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-200 underline"
              >
                {CH_FEE_SOURCE.title}
              </a>
              . Crown copyright — Open Government Licence.
            </aside>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/companies-house/personal-code"
                className="btn btn-light"
              >
                Director personal codes
              </Link>
              <Link href="/create-account" className="btn btn-ghost-light">
                Create account
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
          <CompanySearchPanel />
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
          <h2 className="display text-3xl text-ink">Most requested</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
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
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
            <h2 className="display text-3xl text-ink md:text-4xl">
              Full Companies House service list
            </h2>
            <p className="mt-2 max-w-2xl text-ink-soft">
              Select a service for Companies House requirements, official GOV.UK
              links, and a custom request form.
            </p>

            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {CH_SERVICE_DETAILS.map((s) => {
                const fees = formatChFeeBreakdown(s);
                return (
                  <Link
                    key={s.id}
                    href={`/companies-house/${s.id}`}
                    className="panel flex items-start justify-between gap-4 p-4 transition hover:border-sea"
                  >
                    <div>
                      <p className="font-semibold text-ink">{s.title}</p>
                      <p className="mt-1 text-xs text-ink-soft">
                        {s.channel} · CH {fees.statutory} + Hydra {fees.hydra}
                      </p>
                    </div>
                    <span className="price-amount text-2xl shrink-0">
                      {fees.total}
                    </span>
                  </Link>
                );
              })}
            </div>

            <p className="mt-6 text-xs text-ink-soft">
              Official fee schedule:{" "}
              <a
                href={CH_FEE_SOURCE.url}
                className="text-sea underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GOV.UK Companies House fees
              </a>
              . Always verify the latest statutory rate before filing.
            </p>

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

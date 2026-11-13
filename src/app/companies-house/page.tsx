import Link from "next/link";
import {
  CH_SERVICE_DETAILS,
  formatChServicePrice,
} from "@/lib/ch-services";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CompanySearchPanel } from "@/components/companies-house/company-search-panel";
import { FaqSection } from "@/components/faq-section";
import { faqsForProduct } from "@/lib/product-faqs";

export const metadata = {
  title:
    "Companies House filing — confirmation statement, accounts & incorporation",
  description:
    "File a Companies House confirmation statement, iXBRL annual accounts or UK company incorporation with HydraTax.",
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
    <div className="min-h-screen company-profile">
      <SiteHeader />

      <main>
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
                "radial-gradient(ellipse 70% 55% at 42% 30%, rgba(15,118,110,0.14), transparent 58%), linear-gradient(165deg, #f4fbfa 0%, #f7f9fa 45%, #eef7f6 100%)",
            }}
          />

          <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-8 md:px-6 md:pb-14 md:pt-10">
            <nav className="text-sm text-ink-soft">
              <Link href="/" className="font-semibold text-sea hover:underline">
                Home
              </Link>
              <span className="mx-2 text-line">/</span>
              <span className="text-ink">Companies House</span>
            </nav>

            <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.75fr)] lg:items-stretch">
              <div className="company-profile-hero-copy">
                <p className="gloss-badge inline-flex rounded-lg bg-sea/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
                  Companies House · HydraTax
                </p>
                <h1 className="display mt-4 text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.08] tracking-tight text-ink">
                  Companies House filing
                </h1>
                <p className="mt-4 max-w-xl text-base text-ink-soft">
                  Find your company, then file a confirmation statement,
                  accounts or incorporation online.
                </p>
                <p className="mt-3 text-sm">
                  <Link
                    href="/guides/companies-house"
                    className="font-semibold text-sea hover:underline"
                  >
                    Companies House compliance FAQs →
                  </Link>
                </p>
              </div>

              <div className="company-profile-actions gloss-card relative flex flex-col justify-center overflow-hidden rounded-2xl border border-sea/25 bg-white/90 p-6 shadow-[0_20px_50px_-28px_rgba(15,118,110,0.35)]">
                <div className="gloss-shine" aria-hidden />
                <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-sea">
                  Start filing
                </p>
                <p className="relative mt-2 text-sm text-ink-soft">
                  Guided forms with Companies House fees shown upfront.
                </p>
                <div className="relative mt-5 flex flex-col gap-2.5">
                  <Link
                    href="/companies-house/incorporation"
                    className="btn btn-primary company-cta-primary inline-flex justify-center rounded-xl px-4 py-3 text-center text-sm font-bold"
                  >
                    Incorporate a company
                  </Link>
                  <Link
                    href="/companies-house/confirmation-statement"
                    className="btn btn-secondary inline-flex justify-center rounded-xl px-4 py-3 text-center text-sm font-semibold transition hover:-translate-y-0.5"
                  >
                    Confirmation statement
                  </Link>
                  <Link
                    href="/companies"
                    className="pt-1 text-center text-sm font-semibold text-sea transition hover:text-sea-deep"
                  >
                    Search the directory →
                  </Link>
                </div>
              </div>
            </div>

            <div className="relative mt-10">
              <div className="gloss-card relative overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 md:p-6 shadow-[0_18px_40px_-28px_rgba(15,118,110,0.28)]">
                <div className="gloss-shine" aria-hidden />
                <div className="relative">
                  <CompanySearchPanel
                    variant="embedded"
                    heading="Find your company"
                    description="Search the public register, then open a filing from the company profile."
                  />
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="border-b border-line/70 bg-gradient-to-b from-white to-[#f7fbfa]">
          <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
            <div className="mb-5">
              <h2 className="display text-2xl text-ink md:text-3xl">
                Most requested
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Tap a service to open the guided filing flow.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {popular.map((s, i) => {
                const price = formatChServicePrice(s);
                return (
                  <Link
                    key={s.id}
                    href={`/companies-house/${s.id}`}
                    className="company-deadline-tile gloss-card group relative block overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 transition duration-300 hover:-translate-y-1.5 hover:border-sea/40 hover:shadow-[0_22px_44px_-22px_rgba(15,118,110,0.4)]"
                    style={{ animationDelay: `${0.05 + i * 0.07}s` }}
                  >
                    <div className="gloss-shine" aria-hidden />
                    <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">
                      {s.channel}
                    </p>
                    <p className="display relative mt-3 text-2xl text-ink transition group-hover:text-sea-deep sm:text-3xl">
                      {price}
                    </p>
                    <p className="relative mt-2 text-sm font-semibold text-ink">
                      {s.title}
                    </p>
                    <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold text-sea transition group-hover:gap-2">
                      Start filing
                      <span aria-hidden>→</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
          <div className="mb-5">
            <h2 className="display text-2xl text-ink md:text-3xl">
              Full service list
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Every Companies House filing HydraTax supports.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {CH_SERVICE_DETAILS.map((s, i) => {
              const price = formatChServicePrice(s);
              return (
                <li key={s.id}>
                  <Link
                    href={`/companies-house/${s.id}`}
                    className="company-related-link gloss-card group relative flex items-start justify-between gap-4 overflow-hidden rounded-2xl border border-line/80 bg-white/90 px-5 py-4 transition duration-300 hover:-translate-y-1 hover:border-sea/40 hover:shadow-[0_18px_36px_-22px_rgba(15,118,110,0.35)]"
                    style={{ animationDelay: `${0.04 + i * 0.02}s` }}
                  >
                    <div className="gloss-shine" aria-hidden />
                    <div className="relative min-w-0">
                      <p className="font-semibold text-ink transition group-hover:text-sea">
                        {s.title}
                      </p>
                      <p className="mt-1 text-xs text-ink-soft">{s.channel}</p>
                    </div>
                    <span className="display relative shrink-0 text-2xl text-ink transition group-hover:text-sea-deep">
                      {price}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <FaqSection
            title="Companies House FAQs"
            items={faqsForProduct("companies-house")}
          />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

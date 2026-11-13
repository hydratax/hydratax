import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  CH_COMPLIANCE_SECTIONS,
  allChComplianceFaqs,
} from "@/lib/ch-compliance-faqs";
import { breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "UK Companies House compliance FAQs — CS01, accounts, ECCTA & formation",
  description:
    "Authoritative answers to the most-searched UK company compliance questions: confirmation statements, annual accounts, identity verification, ACSPs, strike-off, incorporation and more — with links to file on HydraTax.",
  keywords: [
    "Companies House FAQ",
    "confirmation statement CS01",
    "Companies House late filing penalties",
    "dormant accounts AA02",
    "Companies House personal code",
    "ACSP",
    "company authentication code",
    "ECCTA identity verification",
    "dissolve limited company DS01",
  ],
  alternates: { canonical: "/guides/companies-house" },
  openGraph: {
    title: "UK Companies House compliance FAQs",
    description:
      "CS01, accounts, identity verification, formation and strike-off — practical answers with HydraTax filing links.",
    url: "/guides/companies-house",
  },
};

export default function CompaniesHouseComplianceGuidePage() {
  const faqs = allChComplianceFaqs().map((item) => ({
    q: item.q,
    a: item.a,
  }));

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Guides", path: "/blog" },
              { name: "Companies House FAQs", path: "/guides/companies-house" },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd(faqs)),
        }}
      />

      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          <Link href="/blog" className="hover:underline">
            Guides
          </Link>
          {" · "}
          Companies House
        </p>
        <h1 className="display mt-2 text-3xl text-ink sm:text-4xl md:text-5xl">
          UK Companies House compliance FAQs
        </h1>
        <p className="mt-4 text-lg text-ink-soft">
          Practical answers for founders, directors and accountants — based on
          current GOV.UK Companies House guidance and ECCTA reforms (identity
          verification, personal codes, ACSPs, registered email and appropriate
          registered office rules). Not personalised legal advice.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/companies" className="btn btn-primary">
            Search a company
          </Link>
          <Link
            href="/companies-house/confirmation-statement"
            className="btn btn-secondary"
          >
            File confirmation statement
          </Link>
          <Link
            href="/companies-house/accounts-ixbrl"
            className="btn btn-secondary"
          >
            File accounts
          </Link>
          <Link href="/create-account" className="btn btn-ghost">
            Create account · weekly reminders
          </Link>
        </div>

        <nav
          aria-label="Sections"
          className="mt-10 rounded-xl border border-line bg-white/80 p-4"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            On this page
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {CH_COMPLIANCE_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="font-semibold text-sea hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {CH_COMPLIANCE_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="mt-14 scroll-mt-24">
            <h2 className="display text-2xl text-ink sm:text-3xl">
              {section.title}
            </h2>
            <p className="mt-2 text-ink-soft">{section.intro}</p>

            <div className="mt-6 space-y-6">
              {section.items.map((item) => (
                <article
                  key={item.q}
                  className="rounded-xl border border-line bg-white/90 p-5"
                >
                  <h3 className="text-lg font-semibold text-ink">{item.q}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                    {item.a}
                  </p>

                  {item.steps?.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                        Steps / process
                      </p>
                      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
                        {item.steps.map((s) => (
                          <li key={s.slice(0, 48)}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  {item.fees ? (
                    <p className="mt-4 rounded-lg border border-line bg-sand/40 px-3 py-2 text-sm text-ink">
                      <span className="font-semibold">Fees: </span>
                      {item.fees}
                    </p>
                  ) : null}

                  {item.pitfalls?.length ? (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                        Watch outs
                      </p>
                      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
                        {item.pitfalls.map((p) => (
                          <li key={p.slice(0, 48)}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {item.hydra?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {item.hydra.map((link) => (
                        <Link
                          key={link.href + link.label}
                          href={link.href}
                          className="rounded-lg border border-sea/30 bg-sea/5 px-3 py-1.5 text-xs font-semibold text-sea hover:bg-sea/10"
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {item.sources?.length ? (
                    <p className="mt-4 text-xs text-ink-soft">
                      Official:{" "}
                      {item.sources.map((s, i) => (
                        <span key={s.href}>
                          {i > 0 ? " · " : null}
                          <a
                            href={s.href}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-sea hover:underline"
                          >
                            {s.label}
                          </a>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}

        <aside className="mt-16 rounded-2xl border border-sea/25 bg-sea/5 p-6">
          <h2 className="display text-2xl text-ink">
            Track deadlines in HydraTax
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            Search any UK company for confirmation statement and accounts due
            dates, file CS01 or iXBRL accounts, and — when you create an account
            — receive weekly reminders for confirmation statements, annual
            accounts and CT600 with links to submit.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/companies" className="btn btn-primary">
              Company search
            </Link>
            <Link href="/create-account" className="btn btn-secondary">
              Create account
            </Link>
            <Link href="/dashboard" className="btn btn-ghost">
              Practice desk
            </Link>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}

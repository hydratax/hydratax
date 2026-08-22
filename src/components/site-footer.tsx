import Link from "next/link";
import Image from "next/image";
import { LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { PRACTICE_TRIAL } from "@/lib/trial";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#services", label: "HMRC filings" },
      { href: "/pricing", label: "Pricing" },
      { href: "/pricing#practice", label: "Practice desk trial" },
      { href: "/companies-house", label: "Companies House" },
      { href: "/dashboard", label: "Practice desk" },
    ],
  },
  {
    title: "File with Hydra",
    links: [
      { href: "/pricing#vat", label: "MTD VAT" },
      { href: "/pricing#ct600", label: "Corporation Tax" },
      { href: "/pricing#self-assessment", label: "Self Assessment" },
      { href: "/pricing#payroll", label: "PAYE / RTI" },
      { href: "/companies-house/confirmation-statement", label: "Confirmation Statement" },
      { href: "/companies-house/accounts-ixbrl", label: "Annual accounts" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/blog", label: "Guides" },
      { href: "/blog/what-is-making-tax-digital", label: "Making Tax Digital" },
      { href: "/blog/what-is-a-confirmation-statement", label: "Confirmation statement" },
      { href: "/blog/hmrc-ct600-regulation-changes", label: "CT600 changes" },
      { href: "/support", label: "Support centre" },
      { href: "/feature-requests", label: "Feature requests" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/sign-in", label: "Sign in" },
      { href: "/create-account", label: "Sign up" },
      { href: "/clients", label: "Clients" },
      { href: "/settings/hmrc", label: "HMRC settings" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/terms#free-trial", label: "Free trial policy" },
      { href: "/terms#privacy", label: "Privacy Policy" },
      { href: "/terms#cookies", label: "Cookie Policy" },
      { href: "/legal/dpa", label: "Data Processing Agreement" },
      { href: "/legal/sub-processors", label: "Sub-processors" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink text-white">
      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
        <div className="mb-10 rounded-xl border border-teal-400/25 bg-teal-950/50 px-5 py-5 md:flex md:items-center md:justify-between md:gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">
              {PRACTICE_TRIAL.shortBadge} · Practice & Custom
            </p>
            <p className="mt-1 text-sm text-white/80 md:text-base">
              {PRACTICE_TRIAL.detail}
            </p>
          </div>
          <Link
            href={PRACTICE_TRIAL.ctaHref}
            className="btn btn-light mt-4 shrink-0 text-sm md:mt-0"
          >
            View Practice plans
          </Link>
        </div>
        <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1.5">
                <Image
                  src="/brand/logo.png"
                  alt="HydraTax"
                  width={32}
                  height={32}
                />
              </span>
              <span className="display text-xl font-semibold">HydraTax</span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
              The UK’s most user-friendly practice software — CT600, MTD VAT,
              Self Assessment, PAYE and Companies House, built for accountants’
              ease.
            </p>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-white/40">
              {LEGAL_COMPANY.tradingName} is a trading name of{" "}
              {LEGAL_COMPANY.legalName} (company number{" "}
              {LEGAL_COMPANY.companyNumber}).
            </p>
            <p className="mt-2 text-sm text-white/55">
              <a
                href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                className="hover:text-white"
              >
                {LEGAL_CONTACT_EMAIL}
              </a>
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300/80">
                  {col.title}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-white/70">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="hover:text-white">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {LEGAL_COMPANY.legalName}.{" "}
            {LEGAL_COMPANY.tradingName} is a trading name. All rights reserved.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/terms#free-trial" className="hover:text-white">
              Free trial
            </Link>
            <Link href="/terms#privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/legal/dpa" className="hover:text-white">
              DPA
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

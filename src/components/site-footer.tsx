import Link from "next/link";
import Image from "next/image";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#services", label: "HMRC rails" },
      { href: "/pricing", label: "Pricing" },
      { href: "/companies-house", label: "Companies House" },
      { href: "/dashboard", label: "Practice desk" },
    ],
  },
  {
    title: "File with Hydra",
    links: [
      { href: "/pricing#vat", label: "MTD VAT" },
      { href: "/pricing#ct600", label: "CT600" },
      { href: "/pricing#self-assessment", label: "Self Assessment" },
      { href: "/pricing#payroll", label: "PAYE / RTI" },
      { href: "/companies-house", label: "Confirmation statement" },
      { href: "/companies-house", label: "Annual accounts" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#features", label: "Features" },
      { href: "/#why-hydratax", label: "Why Hydra" },
      { href: "/#reviews", label: "Reviews" },
      { href: "/support", label: "Support centre" },
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
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink text-white">
      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
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
              Practice software for UK accountants — CT600, MTD VAT, Self
              Assessment, PAYE and Companies House in one desk.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="mt-12 border-t border-white/10 pt-6 text-xs text-white/45">
          <p>© {new Date().getFullYear()} HydraTax. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

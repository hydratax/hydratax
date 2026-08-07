import Link from "next/link";
import Image from "next/image";

const PRODUCTS = [
  { label: "MTD VAT", href: "/pricing#vat" },
  { label: "CT600", href: "/pricing#ct600" },
  { label: "PAYE / RTI", href: "/pricing#payroll" },
  { label: "Self Assessment", href: "/pricing#self-assessment" },
  { label: "Companies House", href: "/companies-house" },
] as const;

export function LandingHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 p-1.5 shadow-sm">
            <Image
              src="/brand/logo.png"
              alt="HydraTax"
              width={28}
              height={28}
              priority
              className="object-contain"
            />
          </span>
          <span className="display text-xl font-semibold text-white">
            HydraTax
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-white/80 md:flex">
          <div className="group relative">
            <button type="button" className="hover:text-white">
              Rails
            </button>
            <div className="invisible absolute left-0 top-full z-30 min-w-[200px] pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="rounded-lg border border-line bg-white py-2 shadow-lg">
                {PRODUCTS.map((p) => (
                  <a
                    key={p.label}
                    href={p.href}
                    className="block px-4 py-2 text-ink-soft hover:bg-sand hover:text-ink"
                  >
                    {p.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
          <a href="#how-it-works" className="hover:text-white">
            How it works
          </a>
          <Link href="/pricing" className="hover:text-white">
            Pricing
          </Link>
          <Link href="/companies-house" className="hover:text-white">
            Companies House
          </Link>
          <Link href="/support" className="hover:text-white">
            Support
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/support" className="btn btn-ghost-light text-sm md:hidden">
            Support
          </Link>
          <Link href="/sign-in" className="btn btn-ghost-light text-sm">
            Sign in
          </Link>
          <Link href="/create-account" className="btn btn-light text-sm">
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}

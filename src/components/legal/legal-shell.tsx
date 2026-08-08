import Link from "next/link";
import Image from "next/image";
import { SiteFooter } from "@/components/site-footer";
import { LEGAL_COMPANY } from "@/lib/legal";

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <Image src="/brand/logo.png" alt="HydraTax" width={32} height={32} />
            <span className="display text-lg font-semibold text-ink">
              {LEGAL_COMPANY.tradingName}
            </span>
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm font-semibold text-ink-soft">
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/terms#privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/legal/dpa" className="hover:text-ink">
              DPA
            </Link>
            <Link href="/pricing" className="hover:text-ink">
              Pricing
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          Legal
        </p>
        <h1 className="display mt-2 text-4xl text-ink md:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Last updated: {updated}</p>
        <div className="legal-prose mt-10 space-y-8 text-sm leading-relaxed text-ink-soft">
          {children}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export function LegalH2({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="display scroll-mt-24 text-2xl text-ink md:text-3xl"
    >
      {children}
    </h2>
  );
}

export function LegalH3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 text-base font-semibold text-ink">{children}</h3>;
}

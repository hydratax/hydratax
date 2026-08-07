import Link from "next/link";
import Image from "next/image";
import { PricingExplorer } from "@/components/pricing/pricing-explorer";
import { SiteFooter } from "@/components/site-footer";
import { isStripeConfigured } from "@/lib/env";

export const metadata = {
  title: "Pricing — CT600, VAT, Self Assessment, PAYE & Companies House",
  description:
    "Transparent HydraTax pricing for accountants and directors: practice desk plans, MTD VAT, CT600, Self Assessment, PAYE RTI, and Companies House filings.",
  keywords: [
    "CT600 software pricing",
    "MTD VAT filing cost",
    "Self Assessment software UK",
    "PAYE RTI software",
    "confirmation statement filing cost",
    "Companies House filing service",
    "accountant tax software UK",
  ],
  openGraph: {
    title: "HydraTax Pricing",
    description:
      "Interactive pricing for practice desk, VAT, CT600, SA, payroll, and Companies House — checkout in one click.",
    type: "website",
  },
};

export default function PricingPage() {
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
              href="/companies-house"
              className="text-ink-soft hover:text-ink"
            >
              Companies House
            </Link>
            <Link href="/support" className="text-ink-soft hover:text-ink">
              Support
            </Link>
            <Link href="/sign-up" className="btn btn-primary text-sm">
              Start practice
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <PricingExplorer stripeReady={isStripeConfigured()} />
      </main>

      <SiteFooter />
    </div>
  );
}

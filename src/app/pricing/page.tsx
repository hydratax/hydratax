import { Suspense } from "react";
import { PricingExplorer } from "@/components/pricing/pricing-explorer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isStripeConfigured } from "@/lib/env";
import { getOptionalSession } from "@/server/auth/session";

export const metadata = {
  title: "Pricing — CT600, VAT, Self Assessment, PAYE & Companies House",
  description:
    "Transparent HydraTax pricing for accountants and directors: practice desk plans (Practice & Custom include a 7-day free trial), MTD VAT, CT600, Self Assessment, PAYE RTI, and Companies House filings.",
  keywords: [
    "HydraTax pricing",
    "CT600 software pricing",
    "MTD VAT filing cost",
    "Self Assessment software UK",
    "PAYE RTI software",
    "confirmation statement filing cost",
    "Companies House filing service",
    "accountant tax software UK",
    "small business accounting software price",
  ],
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "HydraTax Pricing",
    description:
      "Interactive pricing for practice desk, VAT, CT600, SA, payroll, and Companies House. Practice & Custom include a 7-day free trial.",
    type: "website",
    images: [
      {
        url: "/brand/og.png",
        width: 1200,
        height: 630,
        alt: "HydraTax",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/brand/og.png"],
  },
};

export default async function PricingPage() {
  const session = await getOptionalSession();
  // Local/demo memory sessions must not count as signed-in for checkout —
  // anonymous visitors always create a real account before Stripe.
  const signedIn = Boolean(session && !session.local);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-16 text-ink-soft">Loading pricing…</div>}>
          <PricingExplorer
            stripeReady={isStripeConfigured()}
            signedIn={signedIn}
          />
        </Suspense>
      </main>

      <SiteFooter />
    </div>
  );
}

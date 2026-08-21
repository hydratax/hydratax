import { PricingExplorer } from "@/components/pricing/pricing-explorer";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isStripeConfigured } from "@/lib/env";

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

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main>
        <PricingExplorer stripeReady={isStripeConfigured()} />
      </main>

      <SiteFooter />
    </div>
  );
}

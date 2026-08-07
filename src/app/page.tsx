import { LandingHeader } from "@/components/landing/landing-header";
import { DynamicHero } from "@/components/landing/dynamic-hero";
import { ServiceCards } from "@/components/landing/service-cards";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeaturesAndDifference } from "@/components/landing/features-and-difference";
import { ReviewsCarousel } from "@/components/landing/reviews-carousel";
import { SiteFooter } from "@/components/site-footer";
import {
  organizationJsonLd,
  serviceJsonLd,
  webSiteJsonLd,
} from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "HydraTax — File CT600, MTD VAT, Self Assessment, PAYE & Companies House",
  description:
    "UK software for accountants and directors to file corporation tax (CT600), Making Tax Digital VAT, Self Assessment, payroll RTI, confirmation statements and Companies House accounts from one desk.",
  alternates: { canonical: "/" },
};

const MARQUEE = [
  "MTD VAT",
  "CT600",
  "Confirmation statement",
  "PAYE · FPS",
  "Self Assessment",
  "Companies House accounts",
  "Integer pence",
  "Multi-client desk",
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webSiteJsonLd()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(serviceJsonLd()),
        }}
      />

      <LandingHeader />
      <DynamicHero />

      <div className="marquee-rails" aria-hidden>
        <div className="marquee-rails-inner">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span key={`${item}-${i}`} className="inline-flex items-center gap-2.5">
              <span className="text-sea">◆</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      <ServiceCards />
      <HowItWorks />
      <FeaturesAndDifference />
      <ReviewsCarousel />

      <section className="border-t border-line bg-sand/40">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
          <h2 className="display text-3xl text-ink md:text-4xl">
            Built for who you are
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <article className="gloss-card panel p-6">
              <h3 className="display text-2xl text-ink">Accountants & practices</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Multi-client deadlines, staff-safe guided submit, and every HMRC
                rail on one desk — CT600, VAT, SA, PAYE, plus Companies House.
              </p>
            </article>
            <article className="gloss-card panel p-6">
              <h3 className="display text-2xl text-ink">Directors & sole traders</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                File your own confirmation statement, accounts, VAT return or
                Self Assessment without juggling government portals.
              </p>
            </article>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

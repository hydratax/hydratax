import type { Metadata } from "next";
import { LEGAL_COMPANY } from "@/lib/legal";
import { siteUrl } from "@/lib/site";

const SITE = siteUrl();

export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default:
      "HydraTax — UK accounting software for CT600, MTD VAT, bookkeeping & Companies House",
    template: "%s | HydraTax",
  },
  description:
    "HydraTax is UK tax and accounting software for accountants and small businesses. File CT600 corporation tax, MTD VAT, Self Assessment, PAYE, confirmation statements and Companies House accounts from one desk.",
  keywords: [
    "HydraTax",
    "Hydra Tax",
    "UK accounting software",
    "accounting software for small business UK",
    "accountant software UK",
    "bookkeeping software UK",
    "small business tax software",
    "limited company tax return",
    "CT600 software",
    "file CT600 online",
    "corporation tax return software",
    "MTD VAT software",
    "Making Tax Digital VAT",
    "VAT return filing UK",
    "Self Assessment software",
    "SA100 filing",
    "PAYE RTI software",
    "FPS payroll filing",
    "confirmation statement filing",
    "file confirmation statement",
    "CS01 filing",
    "Companies House accounts filing",
    "iXBRL accounts",
    "company incorporation UK",
    "year end accounts software",
    "practice management tax software",
  ],
  authors: [{ name: "HydraTax" }],
  creator: "HydraTax",
  publisher: "Hydra Consultancy Services Ltd",
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: SITE,
    siteName: "HydraTax",
    title: "HydraTax — UK accounting, CT600, MTD VAT & Companies House",
    description:
      "File CT600, MTD VAT, Self Assessment, PAYE, bookkeeping year-end and Companies House services in one HMRC-ready platform.",
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
    title: "HydraTax — CT600, VAT, bookkeeping & Companies House",
    description:
      "UK accounting software for accountants and small limited companies.",
    images: ["/brand/og.png"],
  },
  icons: {
    icon: [{ url: "/brand/logo.png", type: "image/png" }],
    apple: [{ url: "/brand/logo.png", type: "image/png" }],
    shortcut: "/brand/logo.png",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  category: "finance",
};

export function organizationJsonLd() {
  const office = LEGAL_COMPANY.registeredOffice;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: LEGAL_COMPANY.tradingName,
    alternateName: ["Hydra Tax", "HydraTax UK"],
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "UK accounting and tax software for CT600, MTD VAT, Self Assessment, PAYE RTI, bookkeeping and Companies House filings.",
    offers: {
      "@type": "Offer",
      priceCurrency: "GBP",
      price: "29.00",
      url: `${SITE}/pricing`,
    },
    url: SITE,
    image: `${SITE}/brand/og.png`,
    logo: `${SITE}/brand/logo.png`,
    brand: { "@type": "Brand", name: LEGAL_COMPANY.tradingName },
    provider: {
      "@type": "Organization",
      "@id": `${SITE}/#organization`,
      name: LEGAL_COMPANY.legalName,
      legalName: LEGAL_COMPANY.legalName,
      alternateName: LEGAL_COMPANY.tradingName,
      identifier: LEGAL_COMPANY.companyNumber,
      url: SITE,
      email: LEGAL_COMPANY.supportEmail,
      sameAs: [LEGAL_COMPANY.companiesHouseUrl],
      address: {
        "@type": "PostalAddress",
        streetAddress: office.line1,
        addressLocality: office.locality,
        addressRegion: office.region,
        postalCode: office.postalCode,
        addressCountry: "GB",
      },
    },
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "HydraTax",
    alternateName: "Hydra Tax",
    url: SITE,
    inLanguage: "en-GB",
    publisher: {
      "@type": "Organization",
      name: LEGAL_COMPANY.legalName,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE}/support?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function serviceJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "HydraTax filing services",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "CT600 Corporation Tax filing",
        url: `${SITE}/pricing#ct600`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "MTD VAT return filing",
        url: `${SITE}/pricing#vat`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Self Assessment filing",
        url: `${SITE}/pricing#self-assessment`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: "PAYE RTI payroll",
        url: `${SITE}/pricing#payroll`,
      },
      {
        "@type": "ListItem",
        position: 5,
        name: "Companies House confirmation statement",
        url: `${SITE}/companies-house/confirmation-statement`,
      },
      {
        "@type": "ListItem",
        position: 6,
        name: "Companies House accounts filing",
        url: `${SITE}/companies-house/accounts-ixbrl`,
      },
      {
        "@type": "ListItem",
        position: 7,
        name: "UK company incorporation",
        url: `${SITE}/companies-house/incorporation`,
      },
    ],
  };
}

export function accountantReviewsJsonLd(
  reviews: Array<{
    name: string;
    role: string;
    firm: string;
    location: string;
    photo: string;
    quote: string;
    rating: number;
    topic: string;
  }>,
) {
  const avg =
    reviews.reduce((sum, r) => sum + r.rating, 0) / Math.max(reviews.length, 1);

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "HydraTax",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "UK accounting software for accountants — CT600, MTD VAT, Self Assessment, PAYE RTI and Companies House filing from one practice desk.",
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: avg.toFixed(1),
      bestRating: "5",
      worstRating: "1",
      ratingCount: String(reviews.length),
      reviewCount: String(reviews.length),
    },
    review: reviews.map((r) => ({
      "@type": "Review",
      name: r.topic,
      reviewBody: r.quote,
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(r.rating),
        bestRating: "5",
      },
      author: {
        "@type": "Person",
        name: r.name,
        jobTitle: r.role,
        worksFor: {
          "@type": "Organization",
          name: r.firm,
          address: {
            "@type": "PostalAddress",
            addressLocality: r.location,
            addressCountry: "GB",
          },
        },
      },
      image: `${SITE}${r.photo}`,
    })),
  };
}

export function blogPostJsonLd(input: {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
}) {
  const url = `${SITE}/blog/${input.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    mainEntityOfPage: url,
    url,
    inLanguage: "en-GB",
    author: {
      "@type": "Organization",
      name: LEGAL_COMPANY.tradingName,
    },
    publisher: {
      "@type": "Organization",
      name: LEGAL_COMPANY.legalName,
      logo: {
        "@type": "ImageObject",
        url: `${SITE}/brand/logo.png`,
      },
    },
    image: `${SITE}/brand/og.png`,
  };
}

export function faqJsonLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

export function breadcrumbJsonLd(
  crumbs: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE}${c.path}`,
    })),
  };
}

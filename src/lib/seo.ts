import type { Metadata } from "next";

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.co.uk";

export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default:
      "HydraTax — CT600, MTD VAT, Self Assessment, PAYE & Companies House filing",
    template: "%s | HydraTax",
  },
  description:
    "HydraTax helps UK accountants and company directors file CT600 corporation tax, MTD VAT returns, Self Assessment, PAYE RTI payroll, confirmation statements and Companies House accounts from one practice desk.",
  keywords: [
    "CT600 software",
    "file CT600 online",
    "MTD VAT software",
    "VAT return filing UK",
    "Self Assessment software",
    "SA100 filing",
    "PAYE RTI software",
    "FPS payroll filing",
    "confirmation statement filing",
    "Companies House accounts filing",
    "iXBRL accounts",
    "company incorporation UK",
    "accountant tax software UK",
    "corporation tax return software",
    "Making Tax Digital VAT",
  ],
  authors: [{ name: "HydraTax" }],
  creator: "HydraTax",
  openGraph: {
    type: "website",
    locale: "en_GB",
    siteName: "HydraTax",
    title: "HydraTax — Many heads. One desk.",
    description:
      "File CT600, MTD VAT, Self Assessment, PAYE and Companies House services in one HMRC-ready practice platform.",
    images: [{ url: "/brand/logo.png", width: 468, height: 468, alt: "HydraTax" }],
  },
  twitter: {
    card: "summary",
    title: "HydraTax — CT600, VAT, Self Assessment & Companies House",
    description:
      "Practice platform for UK tax and Companies House filings.",
    images: ["/brand/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: "/",
  },
  category: "finance",
};

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "HydraTax",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "UK practice platform for CT600, MTD VAT, Self Assessment, PAYE RTI and Companies House filings.",
    offers: {
      "@type": "Offer",
      priceCurrency: "GBP",
      price: "29.00",
      url: `${SITE}/pricing`,
    },
    url: SITE,
    brand: { "@type": "Brand", name: "HydraTax" },
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "HydraTax",
    url: SITE,
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
        url: `${SITE}/companies-house`,
      },
      {
        "@type": "ListItem",
        position: 6,
        name: "Companies House accounts filing",
        url: `${SITE}/companies-house`,
      },
    ],
  };
}

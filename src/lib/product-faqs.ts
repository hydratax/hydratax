export type FaqItem = { q: string; a: string };

export const CH_SERVICE_FAQS: Record<string, FaqItem[]> = {
  incorporation: [
    {
      q: "What do I need to incorporate a limited company?",
      a: "A unique company name, UK registered office, at least one director, share capital details, SIC code(s), and (from 18 Nov 2025) director personal codes after identity verification.",
    },
    {
      q: "Can HydraTax verify a director’s identity?",
      a: "No. Identity verification is done via GOV.UK One Login or an ACSP. Hydra links you to the official journey and uses personal codes at filing time.",
    },
    {
      q: "How much does incorporation cost?",
      a: "Companies House charges £100 for digital/software incorporation (paper £124). Hydra adds its service fee on top. Always check the GOV.UK fee schedule.",
    },
  ],
  "incorporation-same-day": [
    {
      q: "What is same-day incorporation?",
      a: "A software filing that Companies House aims to process the same day if submitted before their cut-off. The statutory software fee is £156.",
    },
    {
      q: "Is same-day guaranteed?",
      a: "It depends on Companies House processing windows and complete, valid data. Late or incomplete filings may roll to the next day.",
    },
  ],
  "confirmation-statement": [
    {
      q: "Do I need a confirmation statement if nothing changed?",
      a: "Yes. Every company must file at least once every 12 months, even with no changes, and confirm lawful future activities.",
    },
    {
      q: "Why do directors need personal codes?",
      a: "From 18 November 2025, confirmation statements must confirm directors have verified identity. Each director supplies their 11-character personal code.",
    },
    {
      q: "When is the £50 fee due?",
      a: "With the first confirmation statement in each 12-month payment period. Extra statements in the same period do not attract another annual fee.",
    },
  ],
  "accounts-ixbrl": [
    {
      q: "Is there a Companies House fee for accounts?",
      a: "Standard software accounts delivery currently has a £0 statutory filing fee on the GOV.UK schedule. Hydra’s service fee still applies for preparation and submission support.",
    },
    {
      q: "What accounts types can I file?",
      a: "Hydra supports micro-entity, small, dormant and other packs via the request form — ensure content meets Companies Act requirements for your size.",
    },
  ],
  "change-of-name": [
    {
      q: "How do I check a name is available?",
      a: "Search the Companies House register (Find and update company information) before filing. Restricted and identical names can be rejected.",
    },
  ],
  "change-of-name-same-day": [
    {
      q: "What is the same-day name change fee?",
      a: "£85 digital/software per the Companies House fee schedule, plus Hydra’s service charge.",
    },
  ],
  "voluntary-strike-off": [
    {
      q: "Can any company apply to strike off?",
      a: "No. Eligibility rules apply (for example trading, creditor and HMRC positions). Confirm eligibility before requesting DS01.",
    },
  ],
  "registration-of-charge": [
    {
      q: "What is a charge registration?",
      a: "It notifies Companies House of a security interest against the company. Statutory digital fee is £14. Filing deadlines under the Companies Act still apply.",
    },
  ],
  "certificate-incorporation": [
    {
      q: "Is this an electronic certificate?",
      a: "This product covers the postal certificate of incorporation service (£22 standard). Same-day postal options cost more on the GOV.UK schedule.",
    },
  ],
  "certified-copy": [
    {
      q: "What document can I certify?",
      a: "A filed Companies House document for the company. You need the company number and a clear document reference.",
    },
  ],
};

export const PRODUCT_FAQS: Record<string, FaqItem[]> = {
  practice: [
    {
      q: "Who is the Practice desk for?",
      a: "Accountants and bookkeepers managing multiple clients from one workspace — books, documents, HMRC rails and Companies House requests.",
    },
    {
      q: "How do plan limits work?",
      a: "Your Stripe plan unlocks modules and client caps (for example Solo up to 15 clients). Rails stay locked until payment activates the plan.",
    },
  ],
  vat: [
    {
      q: "Is HydraTax Making Tax Digital compatible?",
      a: "Yes for MTD VAT: prepare boxes from integer-pence books, review, then submit with fraud-prevention headers once HMRC OAuth is connected.",
    },
    {
      q: "Do I need a separate plan per VRN?",
      a: "Single VRN covers one registration. Practice VAT pack covers multiple VRNs on the desk — see Pricing.",
    },
  ],
  ct600: [
    {
      q: "How does CT600 filing work?",
      a: "Capture P&L and balance sheet figures, build CT Online XML, review, then submit. Bank categorisation can draft figures for partner review.",
    },
    {
      q: "Can I pay per return?",
      a: "Yes — Per return is one-off; Unlimited CT is a monthly practice unlock.",
    },
  ],
  "self-assessment": [
    {
      q: "Does this cover MTD for Income Tax?",
      a: "Hydra prepares quarterly digital updates from books or categorised bank lines, validates with Zod, then submits when HMRC is connected.",
    },
    {
      q: "Can bank statements prepare Self Assessment?",
      a: "Yes — connect Open Banking (when enabled) or upload CSV/PDF statements. Hydra categorises lines; you review once, then prepare SA.",
    },
  ],
  payroll: [
    {
      q: "What RTI submissions are supported?",
      a: "Pay runs with FPS on payday and EPS for no-payment periods, calculated in integer pence.",
    },
  ],
  "companies-house": [
    {
      q: "Are fees official Companies House rates?",
      a: "Statutory amounts follow the GOV.UK Companies House fees publication. Hydra adds a clear service fee. Links to GOV.UK appear on every service page.",
    },
    {
      q: "Can I look up directors from a company name?",
      a: "Yes — use Companies House search in Hydra. We call the official Public Data API for profile, officers and persons with significant control (PSC). Full historic shareholder registers are not always available as structured API data.",
    },
  ],
};

export function faqsForChService(serviceId: string): FaqItem[] {
  return CH_SERVICE_FAQS[serviceId] ?? [
    {
      q: "Where do fees come from?",
      a: "Statutory fees are published by Companies House on GOV.UK. Hydra shows the breakdown on each service page.",
    },
  ];
}

export function faqsForProduct(sectionId: string): FaqItem[] {
  return PRODUCT_FAQS[sectionId] ?? [];
}

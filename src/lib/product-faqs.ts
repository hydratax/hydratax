export type FaqItem = { q: string; a: string };

export const CH_SERVICE_FAQS: Record<string, FaqItem[]> = {
  incorporation: [
    {
      q: "What do I need to incorporate a limited company?",
      a: "Use the guided IN01 wizard: company name (live register check), UK registered office, registered email, directors with personal codes and home addresses, share capital/shareholders, and SIC code(s). Hydra builds the Companies House XML package with model articles.",
    },
    {
      q: "Can I incorporate with only a personal code?",
      a: "No. A personal code confirms a director’s identity for appointment, but incorporation also needs company details, subscribers/share capital, SIC codes, and Hydra’s Companies House software presenter credentials to submit the filing.",
    },
    {
      q: "Can HydraTax verify a director’s identity?",
      a: "No. Identity verification is done via GOV.UK One Login or an ACSP. Enter the personal codes on the incorporation form once verification is complete.",
    },
    {
      q: "How much does incorporation cost?",
      a: "Digital / software incorporation is £100 on the current Companies House fee schedule.",
    },
  ],
  "incorporation-same-day": [
    {
      q: "What is same-day incorporation?",
      a: "A software filing that Companies House aims to process the same day if submitted before their cut-off. Total £171 (Companies House £156 + Hydra £15).",
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
      q: "When is the confirmation statement fee due?",
      a: "£65 total (Companies House £50 + Hydra £15) with the first confirmation statement in each 12-month payment period. Extra statements in the same period do not attract another Companies House annual fee.",
    },
  ],
  "accounts-ixbrl": [
    {
      q: "Is there a Companies House fee for accounts?",
      a: "Companies House statutory fee for standard software accounts is £0. Hydra’s software fee for this filing is £25.",
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
      a: "£105 total (Companies House £85 + Hydra £20).",
    },
  ],
};

export const PRODUCT_FAQS: Record<string, FaqItem[]> = {
  practice: [
    {
      q: "Is there a free trial?",
      a: "Yes on Small Firm and Enterprise — 7 days free. You add a card at checkout (£0 today). During the trial you can prepare returns and use the desk; live submission to HMRC or Companies House ends the trial and charges your selected plan. Otherwise billing starts on day 8. Cancel within 7 days from Settings → Subscription for no charge. Solo and other module plans do not include this trial.",
    },
    {
      q: "Who is the Practice desk for?",
      a: "Accountants and bookkeepers managing multiple clients from one workspace — books, documents, HMRC rails and Companies House requests.",
    },
    {
      q: "How do plan limits work?",
      a: "Small Firm is for 2 to 10 clients and includes CT600, MTD VAT, dormant and trading accounts, letters/forms, and Self Assessment. Solo is one client. Enterprise starts from 11 clients per selected HMRC module, with volume discounts, and stays under £5,000 at 1,000 clients per module.",
    },
    {
      q: "Do you offer yearly billing?",
      a: "Yes on Solo, Small Firm and Enterprise. Pay yearly and get 15% off — almost 2 months free compared with paying month by month. Toggle Yearly on the Practice desk pricing tab before checkout.",
    },
  ],
  vat: [
    {
      q: "Is HydraTax Making Tax Digital compatible?",
      a: "Yes for MTD VAT: prepare boxes from integer-pence books, review, then submit with fraud-prevention headers once HMRC OAuth is connected.",
    },
    {
      q: "Do I need a separate plan per VRN?",
      a: "One company or sole trader covers a single registration at £19/month. The VAT practice pack covers up to 15 companies or sole traders at £190/month — see Pricing.",
    },
  ],
  ct600: [
    {
      q: "How does CT600 filing work?",
      a: "Capture P&L and balance sheet figures, build CT Online XML, review, then submit. Bank categorisation can draft figures for partner review. Dormant company accounts are included on the per-return card.",
    },
    {
      q: "Can I pay per return?",
      a: "Yes — Per return is one-off (including dormant accounts). The CT practice pack is £350/year for up to 15 companies.",
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
    {
      q: "What do the SA plans include?",
      a: "1 SA return is £49 per return. The SA practice pack is £499/year for up to 15 Self Assessment returns. Filed downloads stay accessible for life.",
    },
  ],
  payroll: [
    {
      q: "What RTI submissions are supported?",
      a: "Weekly or monthly pay runs with a Full Payment Submission (FPS) on or before payday, and an Employer Payment Summary (EPS) when nobody was paid. HydraTax previews year-to-date figures and blocks reused payroll IDs before the XML is built.",
    },
    {
      q: "How many employees and employers can I run?",
      a: "One employer covers 1 company with up to 10 employees at £19/month. Practice PAYE covers 15 companies with up to 10 employees each at £190/month.",
    },
    {
      q: "Can I print payslips and send them to the client?",
      a: "Yes. After an FPS, open History & packs to print each payslip, or email a password-protected zip of every payslip plus a payroll summary. You set the password yourself.",
    },
    {
      q: "Can payslips be generated from a timesheet?",
      a: "Upload an Excel timesheet (hours, sick days, holiday, maternity). HydraTax matches staff and applies 2026/27 HMRC rates for statutory sick pay, maternity pay, holiday accrual and auto-enrolment.",
    },
  ],
  "companies-house": [
    {
      q: "Are fees official Companies House rates?",
      a: "Fees follow the current GOV.UK Companies House schedule. Each service page shows one total price.",
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
      a: "Fees are published by Companies House on GOV.UK. Each service page shows one total price.",
    },
  ];
}

export function faqsForProduct(sectionId: string): FaqItem[] {
  return PRODUCT_FAQS[sectionId] ?? [];
}

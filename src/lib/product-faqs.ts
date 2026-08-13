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
      a: "Companies House charges £100 for digital/software incorporation (paper £124). Hydra adds its service fee on top.",
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
};

export const PRODUCT_FAQS: Record<string, FaqItem[]> = {
  practice: [
    {
      q: "Is there a free trial?",
      a: "Yes on Practice and Custom desk plans — 7 days free. You add a card at checkout (£0 today); the first charge is on day 8. Solo and other module plans do not include a free trial. No Hydra fees and free submissions while you trial. Companies House statutory fees still apply where charged. We email you on day 7 before billing starts. Cancel anytime before day 8.",
    },
    {
      q: "Who is the Practice desk for?",
      a: "Accountants and bookkeepers managing multiple clients from one workspace — books, documents, HMRC rails and Companies House requests.",
    },
    {
      q: "How do plan limits work?",
      a: "Practice is capped at 50 clients and includes CT600, MTD VAT and 50 Self Assessments. Solo is one client. Custom unlocks only the HMRC modules you pick, with volume discounts as client count grows.",
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
      a: "Weekly or monthly pay runs with a Full Payment Submission (FPS) on or before payday, and an Employer Payment Summary (EPS) when nobody was paid. HydraTax previews year-to-date figures and blocks reused payroll IDs before the XML is built.",
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

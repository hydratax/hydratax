import type { TaxDomain } from "@/lib/hmrc-rulebook/rates";

export type RuleFaq = {
  id: string;
  domain: TaxDomain;
  question: string;
  answer: string;
  sourceUrl?: string;
};

/**
 * Practice-desk FAQs grounded in GOV.UK / HMRC manuals.
 * Expand whenever a client or accountant asks something new — cite the official page.
 */
export const HMRC_FAQS: RuleFaq[] = [
  // —— Corporation Tax ——
  {
    id: "ct-which-rate",
    domain: "ct",
    question: "Which Corporation Tax rate does my limited company pay?",
    answer:
      "From 1 April 2023: 19% small profits rate if taxable profits are £50,000 or less; 25% main rate if profits are above £250,000; between those limits you pay 25% less marginal relief (standard fraction 3/200). Thresholds are shared with associated companies and reduced for short accounting periods.",
    sourceUrl:
      "https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax",
  },
  {
    id: "ct-marginal",
    domain: "ct",
    question: "What is marginal relief for Corporation Tax?",
    answer:
      "Marginal relief softens the step from 19% to 25%. If augmented profits sit between the lower (£50,000) and upper (£250,000) limits, HMRC charges the main rate then subtracts relief using the standard fraction. HydraTax applies this automatically on CT600 and year-end accounts when you leave the CT box blank.",
    sourceUrl: "https://www.gov.uk/guidance/corporation-tax-marginal-relief",
  },
  {
    id: "ct-associates",
    domain: "ct",
    question: "How do associated companies change the £50k / £250k limits?",
    answer:
      "Divide the lower and upper limits by (number of associated companies + 1). Example: three associates → limits ÷ 4 → £12,500 and £62,500 for a 12-month period.",
    sourceUrl: "https://www.gov.uk/guidance/corporation-tax-marginal-relief",
  },
  {
    id: "ct-when-due",
    domain: "ct",
    question: "When is Corporation Tax due?",
    answer:
      "Most companies pay nine months and one day after the end of the accounting period. Large companies may need quarterly instalments. File the Company Tax Return (CT600) within 12 months of the period end.",
    sourceUrl: "https://www.gov.uk/corporation-tax",
  },

  // —— VAT ——
  {
    id: "vat-rates",
    domain: "vat",
    question: "What are the UK VAT rates?",
    answer:
      "Standard 20%, reduced 5%, zero-rated 0%. Some supplies are exempt (e.g. many financial and insurance services). Zero-rated is not the same as exempt — you can usually reclaim input VAT on costs relating to zero-rated sales.",
    sourceUrl: "https://www.gov.uk/vat-rates",
  },
  {
    id: "vat-register",
    domain: "vat",
    question: "When must a business register for VAT?",
    answer:
      "Compulsory registration when taxable turnover exceeds the VAT registration threshold in a rolling 12 months (check GOV.UK for the current figure — £90,000 from 1 April 2024). You can also register voluntarily below the threshold.",
    sourceUrl: "https://www.gov.uk/vat-registration-thresholds",
  },
  {
    id: "vat-mtd",
    domain: "vat",
    question: "Do I have to use Making Tax Digital for VAT?",
    answer:
      "VAT-registered businesses must keep digital records and submit returns using MTD-compatible software (HydraTax supports MTD VAT obligations → boxes → submit with fraud-prevention headers).",
    sourceUrl: "https://www.gov.uk/guidance/making-tax-digital-for-vat",
  },
  {
    id: "vat-flat",
    domain: "vat",
    question: "What is the VAT Flat Rate Scheme?",
    answer:
      "A simplified scheme where you pay a fixed percentage of turnover instead of calculating output minus input VAT. Eligibility and sector percentages are on GOV.UK; limited cost traders use a different percentage.",
    sourceUrl: "https://www.gov.uk/vat-flat-rate-scheme",
  },
  {
    id: "vat-einvoicing-dd",
    domain: "vat",
    question: "When do VAT e-invoicing and Direct Debit rules change?",
    answer:
      "VAT e-invoicing is required from April 2029 (government roadmap). From the same April 2029 date, employers must have a Direct Debit instruction in place for PAYE and VAT return liabilities (other payment methods remain available). Autumn Budget 2026.",
    sourceUrl:
      "https://www.gov.uk/government/publications/e-invoicing-implementation-roadmap",
  },

  // —— Self Assessment ——
  {
    id: "sa-who",
    domain: "sa",
    question: "Who needs to file a Self Assessment return?",
    answer:
      "Typically sole traders, partners, company directors with untaxed income, landlords, and anyone HMRC asks to file. Deadlines: 31 October (paper) / 31 January (online) following the tax year ending 5 April.",
    sourceUrl: "https://www.gov.uk/self-assessment-tax-returns",
  },
  {
    id: "sa-bands",
    domain: "sa",
    question: "What are the Income Tax bands for England / NI / Wales?",
    answer:
      "After the Personal Allowance (£12,570): basic 20% up to £37,700 of taxable income, higher 40% from £37,701 to £125,140, additional 45% above that — frozen for 2024–25, 2025–26 and 2026–27. Scotland has different bands.",
    sourceUrl:
      "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
  },
  {
    id: "sa-pa-taper",
    domain: "sa",
    question: "When does the Personal Allowance start to reduce?",
    answer:
      "By £1 for every £2 of adjusted net income above £100,000, down to zero. At £125,140 there is no Personal Allowance left.",
    sourceUrl:
      "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
  },
  {
    id: "sa-se-class4",
    domain: "sa",
    question: "What Class 4 National Insurance does a self-employed person pay?",
    answer:
      "On annual profits: 0% below £12,570; 6% from £12,570 to £50,270; 2% above £50,270 (2024–25, 2025–26 and 2026–27). In 2023–24 the main rate was 9%.",
    sourceUrl:
      "https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions",
  },
  {
    id: "sa-se-class2",
    domain: "sa",
    question: "Do self-employed people still pay Class 2 NI?",
    answer:
      "From 6 April 2024 Class 2 is no longer compulsory. People with profits at or above the Lower Profits Limit keep building entitlement. Voluntary Class 2 remains available (weekly: £3.45 in 2024–25, £3.50 in 2025–26, £3.65 in 2026–27).",
    sourceUrl:
      "https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions",
  },
  {
    id: "sa-trading-allowance",
    domain: "sa",
    question: "What is the trading income allowance?",
    answer:
      "Through 2026–27: up to £1,000 a year can be deducted from self-employment / casual trading receipts instead of claiming expenses and capital allowances. From 2027–28 (Autumn Budget 2026) the allowance rises to £3,000 and the SA reporting threshold for trading/miscellaneous income rises with it. It cannot be used with expenses on the same trade, and not against connected-party income.",
    sourceUrl:
      "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
  },
  {
    id: "sa-savings-property-2728",
    domain: "sa",
    question: "What happens to savings and property Income Tax rates from April 2027?",
    answer:
      "From 6 April 2027 (2027–28), savings Income Tax rates across the UK rise to 24% basic / 44% higher / 49% additional. Property Income Tax rates for England, Wales and Northern Ireland rise to the same 24% / 44% / 49%. These are separate from non-savings earned-income bands. Legislated in Finance Bill 2026–27 (Autumn Budget 2026).",
    sourceUrl:
      "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
  },
  {
    id: "sa-dividends",
    domain: "sa",
    question: "What are the dividend tax rates for a sole trader who also receives dividends?",
    answer:
      "Dividend allowance £500 (from 2024–25). Rates on the excess: 8.75% / 33.75% / 39.35% in 2024–25 and 2025–26; from 2026–27 basic and higher rise to 10.75% and 35.75% (additional stays 39.35%).",
    sourceUrl:
      "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
  },
  {
    id: "sa-payments-on-account",
    domain: "sa",
    question: "What are payments on account?",
    answer:
      "If your balancing payment is £1,000 or more and less than 80% of the previous year’s liability was collected at source, HMRC usually requires two payments on account (31 January and 31 July) towards the next year. From April 2029, ITSA Timely Payment will replace large infrequent instalments with smaller, more regular in-year payments (e.g. Direct Debit) for taxpayers who make payments on account.",
    sourceUrl:
      "https://www.gov.uk/government/consultations/timely-payments-in-income-tax-self-assessment/timely-payments-in-income-tax-self-assessment-itsa",
  },
  {
    id: "sa-mtd-itsa-return",
    domain: "sa",
    question: "Do MTD for Income Tax quarterly updates replace the annual SA return?",
    answer:
      "No. Customers who started Making Tax Digital for Income Tax from 6 April 2026 still need to submit their 2025–26 Self Assessment return in the usual way by 31 January 2027. Quarterly updates during 2026–27 are summaries and do not replace that return (HMRC SA campaign, Nov 2026).",
    sourceUrl: "https://www.gov.uk/self-assessment-tax-returns",
  },

  // —— PAYE / NI ——
  {
    id: "paye-mpbiks",
    domain: "paye",
    question: "When does mandatory payrolling of benefits in kind start?",
    answer:
      "From April 2027 employers must payroll most benefits in kind through RTI (MPBiKs). HMRC published further draft guidance on 9 November 2026. The P46(Car) reporting method is decommissioned from 6 April 2027 — do not build new product flows that rely on it.",
    sourceUrl:
      "https://www.gov.uk/guidance/draft-guidance-and-legislation-to-aid-preparation-for-reporting-benefits-in-kind-in-real-time",
  },
  {
    id: "paye-codes",
    domain: "paye",
    question: "What is the emergency tax code for 2025–26?",
    answer:
      "Emergency codes from 6 April 2025 are 1257L W1, 1257L M1 and 1257L X — based on the £12,570 personal allowance. Use P9X each year for codes to carry forward.",
    sourceUrl:
      "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
  },
  {
    id: "paye-ni-employee",
    domain: "paye",
    question: "What National Insurance do employees pay in 2025–26?",
    answer:
      "For category A: 0% up to the primary threshold (£12,570), 8% up to the upper earnings limit (£50,270), then 2% above. Other category letters (B, C, J, H, etc.) have different rates — see the employer rates table.",
    sourceUrl:
      "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
  },
  {
    id: "paye-ni-employer",
    domain: "paye",
    question: "What National Insurance do employers pay in 2025–26?",
    answer:
      "Category A employer contributions are generally 15% on earnings above the secondary threshold (£5,000 a year). Reliefs exist for under-21s, apprentices under 25, Freeports and Investment Zones up to their upper secondary thresholds.",
    sourceUrl:
      "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
  },
  {
    id: "paye-fps",
    domain: "paye",
    question: "When must I submit Full Payment Submission (FPS)?",
    answer:
      "On or before each payday. If you have nothing to pay in a tax month you may need an Employer Payment Summary (EPS) instead. HydraTax builds FPS/EPS from the payroll run.",
    sourceUrl: "https://www.gov.uk/guidance/what-payroll-information-to-report-to-hmrc",
  },
];

export const DOMAIN_LABEL: Record<TaxDomain, string> = {
  ct: "Corporation Tax",
  vat: "VAT",
  sa: "Self Assessment",
  paye: "PAYE",
  ni: "National Insurance",
};

export function faqsForDomain(domain: TaxDomain | "all") {
  if (domain === "all") return HMRC_FAQS;
  return HMRC_FAQS.filter((f) => f.domain === domain);
}

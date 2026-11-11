/**
 * HydraTax HMRC rulebook — rates sourced from GOV.UK.
 * Prefer linking to the official page; do not invent rates.
 *
 * Refresh when GOV.UK publications update (typically each Budget / 6 April / 1 April).
 */

export type TaxDomain = "ct" | "vat" | "paye" | "sa" | "ni";

export type RateSource = {
  title: string;
  url: string;
  updated?: string;
};

export type RateFact = {
  id: string;
  domain: TaxDomain;
  label: string;
  value: string;
  detail?: string;
  period?: string;
  source: RateSource;
};

/** Corporation Tax — financial years from 1 April 2023 onwards (non–ring fence). */
export const CT_RATES: RateFact[] = [
  {
    id: "ct-spr",
    domain: "ct",
    label: "Small profits rate",
    value: "19%",
    detail: "Taxable profits of £50,000 or less (no associates, 12-month period).",
    period: "FY2023–FY2026",
    source: {
      title: "Corporation Tax rates and allowances",
      url: "https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax",
      updated: "2026-04-01",
    },
  },
  {
    id: "ct-main",
    domain: "ct",
    label: "Main rate",
    value: "25%",
    detail: "Taxable profits above £250,000.",
    period: "FY2023–FY2026",
    source: {
      title: "Corporation Tax rates and allowances",
      url: "https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax",
      updated: "2026-04-01",
    },
  },
  {
    id: "ct-marginal",
    domain: "ct",
    label: "Marginal relief band",
    value: "£50,001–£250,000",
    detail: "Tax at 25% less marginal relief; standard fraction 3/200.",
    period: "FY2023–FY2026",
    source: {
      title: "Marginal Relief for Corporation Tax",
      url: "https://www.gov.uk/guidance/corporation-tax-marginal-relief",
      updated: "2023-01-05",
    },
  },
  {
    id: "ct-fraction",
    domain: "ct",
    label: "Standard marginal relief fraction",
    value: "3/200",
    period: "FY2023–FY2026",
    source: {
      title: "Corporation Tax rates and allowances",
      url: "https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax",
      updated: "2026-04-01",
    },
  },
  {
    id: "ct-rd-claim-notification",
    domain: "ct",
    label: "R&D relief — claim notification form",
    value: "No longer required",
    detail:
      "From 1 April 2027 companies need not submit a claim notification form. HMRC will introduce a simplified Additional Information Form for claims in Autumn 2027.",
    period: "From 1 Apr 2027",
    source: {
      title: "Budget 2026 overview of tax legislation and rates (OOTLAR)",
      url: "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
      updated: "2026-10-30",
    },
  },
  {
    id: "ct-admin-modernisation",
    domain: "ct",
    label: "Modernising Corporation Tax administration",
    value: "Call for evidence open",
    detail:
      "Autumn Budget 2026: government seeking views on a modernised CT administration system (reporting and paying right first time). Administrative changes confirmed later (e.g. Tax Update 2027).",
    period: "Call for evidence from 30 Oct 2026",
    source: {
      title: "Modernising the administration of Corporation Tax",
      url: "https://www.gov.uk/government/calls-for-evidence/modernising-corporation-tax-administration",
      updated: "2026-10-30",
    },
  },
];

export const VAT_RATES: RateFact[] = [
  {
    id: "vat-standard",
    domain: "vat",
    label: "Standard rate",
    value: "20%",
    detail: "Most goods and services.",
    source: {
      title: "VAT rates",
      url: "https://www.gov.uk/vat-rates",
    },
  },
  {
    id: "vat-reduced",
    domain: "vat",
    label: "Reduced rate",
    value: "5%",
    detail: "Some goods and services (e.g. children’s car seats, home energy).",
    source: {
      title: "VAT rates",
      url: "https://www.gov.uk/vat-rates",
    },
  },
  {
    id: "vat-zero",
    domain: "vat",
    label: "Zero rate",
    value: "0%",
    detail: "Zero-rated supplies (e.g. most food, children’s clothes) — still VAT-able.",
    source: {
      title: "VAT rates",
      url: "https://www.gov.uk/vat-rates",
    },
  },
  {
    id: "vat-threshold",
    domain: "vat",
    label: "VAT registration threshold",
    value: "£90,000",
    detail: "Taxable turnover in a rolling 12 months (check GOV.UK for current figure).",
    period: "From 1 April 2024",
    source: {
      title: "VAT registration thresholds",
      url: "https://www.gov.uk/vat-registration-thresholds",
    },
  },
  {
    id: "vat-domestic-electricity-temp-zero",
    domain: "vat",
    label: "Temporary 0% VAT — domestic electricity",
    value: "0% until 1 Jul 2027",
    detail:
      "Autumn Budget 2026 extended the temporary 0% rate for domestic electricity (originally six months from 1 Oct 2026) by a further three months, to 1 July 2027. Expected UK-wide from April 2027.",
    period: "To 1 Jul 2027",
    source: {
      title: "Budget 2026 overview of tax legislation and rates (OOTLAR)",
      url: "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
      updated: "2026-10-30",
    },
  },
  {
    id: "vat-social-housing-land",
    domain: "vat",
    label: "Zero-rate VAT — land to registered social housing providers",
    value: "0%",
    detail:
      "Zero-rate for land sold to registered providers of social housing (relevant Housing Associations). Secondary legislation early 2027.",
    period: "From 1 Apr 2027",
    source: {
      title: "VAT treatment of land for social housing",
      url: "https://www.gov.uk/government/consultations/vat-treatment-of-land-for-social-housing",
      updated: "2026-10-30",
    },
  },
  {
    id: "vat-ompl-uk",
    domain: "vat",
    label: "VAT Online Marketplace Liability (OMPL) — UK sellers",
    value: "From October 2027",
    detail:
      "OMPL extended to UK businesses: marketplaces collect VAT on sales by UK VAT-registered businesses and other UK businesses meeting a £90,000 annual sales threshold per platform. Not personal/second-hand/B2B.",
    period: "From October 2027",
    source: {
      title: "Budget 2026 overview of tax legislation and rates (OOTLAR)",
      url: "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
      updated: "2026-10-30",
    },
  },
  {
    id: "vat-einvoicing",
    domain: "vat",
    label: "VAT e-invoicing requirement",
    value: "From April 2029",
    detail: "Government roadmap requires VAT e-invoicing from April 2029.",
    period: "From April 2029",
    source: {
      title: "E-invoicing implementation roadmap",
      url: "https://www.gov.uk/government/publications/e-invoicing-implementation-roadmap",
      updated: "2026-10-30",
    },
  },
  {
    id: "vat-paye-direct-debit",
    domain: "vat",
    label: "PAYE & VAT return liabilities — Direct Debit",
    value: "Instruction required from April 2029",
    detail:
      "Employers must have a Direct Debit instruction in place with HMRC for PAYE and VAT return liabilities from April 2029; other payment methods remain available.",
    period: "From April 2029",
    source: {
      title: "Requiring payment of VAT and PAYE return liabilities by Direct Debit",
      url: "https://www.gov.uk/government/consultations/requiring-paymentof-vat-and-paye-return-liabilitiesbydirect-debit",
      updated: "2026-10-30",
    },
  },
];

const IT_SRC = {
  title: "Income Tax rates and allowances",
  url: "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
  updated: "2026-04-06",
} as const;

const NI_SRC = {
  title: "Rates and allowances: National Insurance contributions",
  url: "https://www.gov.uk/government/publications/rates-and-allowances-national-insurance-contributions/rates-and-allowances-national-insurance-contributions",
  updated: "2026-04-06",
} as const;

const ALLOW_SRC = {
  title: "Tax-free allowances on property and trading income",
  url: "https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income",
} as const;

/** Self Assessment / self-employed — current year + previous two (GOV.UK). */
export const SA_RATES: RateFact[] = [
  {
    id: "sa-pa",
    domain: "sa",
    label: "Personal Allowance",
    value: "£12,570",
    detail: "Tapers by £1 for every £2 of income above £100,000.",
    period: "2024–25 · 2025–26 · 2026–27",
    source: IT_SRC,
  },
  {
    id: "sa-basic",
    domain: "sa",
    label: "Basic rate (England, NI, Wales)",
    value: "20%",
    detail: "On taxable income after allowances up to £37,700 (higher-rate threshold £50,270 with standard PA).",
    period: "2024–25 · 2025–26 · 2026–27",
    source: IT_SRC,
  },
  {
    id: "sa-higher",
    domain: "sa",
    label: "Higher rate (England, NI, Wales)",
    value: "40%",
    detail: "£37,701 to £125,140 of taxable income after allowances.",
    period: "2024–25 · 2025–26 · 2026–27",
    source: IT_SRC,
  },
  {
    id: "sa-additional",
    domain: "sa",
    label: "Additional rate (England, NI, Wales)",
    value: "45%",
    detail: "Above £125,140 of taxable income after allowances.",
    period: "2024–25 · 2025–26 · 2026–27",
    source: IT_SRC,
  },
  {
    id: "sa-blind",
    domain: "sa",
    label: "Blind Person’s Allowance",
    value: "£3,070 / £3,130 / £3,250",
    detail: "2024–25 / 2025–26 / 2026–27.",
    period: "2024–25 · 2025–26 · 2026–27",
    source: IT_SRC,
  },
  {
    id: "sa-trading-allowance",
    domain: "sa",
    label: "Trading income allowance (self-employed)",
    value: "£1,000",
    detail:
      "Optional instead of expenses/capital allowances. Cannot combine with expenses on the same trade. Does not apply to partnership income from a connected party.",
    period: "Through 2026–27 (from 6 Apr 2017)",
    source: ALLOW_SRC,
  },
  {
    id: "sa-trading-allowance-2728",
    domain: "sa",
    label: "Trading income allowance (self-employed)",
    value: "£3,000",
    detail:
      "Autumn Budget 2026: rises from £1,000 to £3,000; SA reporting threshold for trading/miscellaneous income rises with it. Still optional instead of expenses on the same trade.",
    period: "From 2027–28 (6 Apr 2027)",
    source: {
      title: "Budget 2026 overview of tax legislation and rates (OOTLAR)",
      url: "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
      updated: "2026-10-30",
    },
  },
  {
    id: "sa-property-allowance",
    domain: "sa",
    label: "Property income allowance",
    value: "£1,000",
    detail:
      "Separate £1,000 for property income; cannot combine with actual expenses on the same property business. Budget 2026 did not raise the property allowance (only trading).",
    period: "Through 2026–27 · still £1,000 announced for 2027–28",
    source: ALLOW_SRC,
  },
  {
    id: "sa-savings-rates-2728",
    domain: "sa",
    label: "Savings Income Tax rates (UK)",
    value: "24% / 44% / 49%",
    detail:
      "Basic / higher / additional rates on savings income. Legislated in Finance Bill 2026–27. Distinct from non-savings earned-income rates.",
    period: "From 6 Apr 2027 (2027–28)",
    source: {
      title: "Budget 2026 overview of tax legislation and rates (OOTLAR)",
      url: "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
      updated: "2026-10-30",
    },
  },
  {
    id: "sa-property-rates-2728",
    domain: "sa",
    label: "Property Income Tax rates (England, Wales, NI)",
    value: "24% / 44% / 49%",
    detail:
      "Basic / higher / additional rates on property income from 6 April 2027. Scotland may differ for non-savings; these property rates apply across England, Wales and Northern Ireland per Budget 2026.",
    period: "From 6 Apr 2027 (2027–28)",
    source: {
      title: "Budget 2026 overview of tax legislation and rates (OOTLAR)",
      url: "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
      updated: "2026-10-30",
    },
  },
  {
    id: "sa-itsa-timely-payment",
    domain: "sa",
    label: "ITSA Timely Payment",
    value: "From April 2029",
    detail:
      "Taxpayers who make payments on account move to smaller, more regular payments in the year income is earned (e.g. Direct Debit), instead of large infrequent instalments months later.",
    period: "From April 2029",
    source: {
      title: "Timely payments in Income Tax Self Assessment (ITSA)",
      url: "https://www.gov.uk/government/consultations/timely-payments-in-income-tax-self-assessment/timely-payments-in-income-tax-self-assessment-itsa",
      updated: "2026-10-30",
    },
  },
  {
    id: "sa-employment-expenses-p87",
    domain: "sa",
    label: "Employment expenses claims above £2,500",
    value: "Via PAYE (P87) — no SA solely for claim",
    detail:
      "From 6 April 2028 the £2,500 threshold that forced a Self Assessment return to claim employment expenses is removed. Claims above £2,500 can go through PAYE using P87 / the PAYE Expenses service with evidence.",
    period: "From 6 Apr 2028",
    source: {
      title: "Budget 2026 overview of tax legislation and rates (OOTLAR)",
      url: "https://www.gov.uk/government/publications/budget-2026-overview-of-tax-legislation-and-rates-ootlar",
      updated: "2026-10-30",
    },
  },
  {
    id: "sa-div-allowance",
    domain: "sa",
    label: "Dividend allowance",
    value: "£500",
    detail: "Was £1,000 in 2023–24; £500 from 2024–25 onwards.",
    period: "2024–25 · 2025–26 · 2026–27",
    source: IT_SRC,
  },
  {
    id: "sa-div-rates-2526",
    domain: "sa",
    label: "Dividend tax rates",
    value: "8.75% / 33.75% / 39.35%",
    detail: "Basic / higher / additional — on dividends above the allowance.",
    period: "2024–25 · 2025–26",
    source: IT_SRC,
  },
  {
    id: "sa-div-rates-2627",
    domain: "sa",
    label: "Dividend tax rates",
    value: "10.75% / 35.75% / 39.35%",
    detail: "Basic / higher / additional — increased from 6 April 2026.",
    period: "2026–27",
    source: IT_SRC,
  },
  {
    id: "sa-savings-psa",
    domain: "sa",
    label: "Personal Savings Allowance",
    value: "£1,000 basic · £500 higher · £0 additional",
    detail: "Plus 0% starting rate for savings up to £5,000 (reduced by non-savings income).",
    period: "2024–25 · 2025–26 · 2026–27",
    source: IT_SRC,
  },
  {
    id: "ni-c4-main-2425",
    domain: "ni",
    label: "Class 4 NI (self-employed) main rate",
    value: "6%",
    detail: "On profits between Lower Profits Limit £12,570 and Upper Profits Limit £50,270; 2% above UPL.",
    period: "2024–25 · 2025–26 · 2026–27",
    source: NI_SRC,
  },
  {
    id: "ni-c4-main-2324",
    domain: "ni",
    label: "Class 4 NI (self-employed) main rate",
    value: "9%",
    detail: "On profits £12,570–£50,270; 2% above UPL. Reduced to 6% from 2024–25.",
    period: "2023–24",
    source: NI_SRC,
  },
  {
    id: "ni-c2-voluntary",
    domain: "ni",
    label: "Class 2 NI (self-employed) — voluntary weekly rate",
    value: "£3.45 / £3.50 / £3.65",
    detail:
      "2024–25 / 2025–26 / 2026–27. From 6 April 2024 Class 2 is no longer compulsory; entitlement can continue via Class 4 profits or voluntary Class 2. Small Profits Threshold: £6,725 (2024–25), £6,845 (2025–26), £7,105 (2026–27).",
    period: "2024–25 · 2025–26 · 2026–27",
    source: NI_SRC,
  },
  {
    id: "ni-c2-2324",
    domain: "ni",
    label: "Class 2 NI (self-employed) — compulsory weekly rate",
    value: "£3.45",
    detail: "Payable when profits above Lower Profits Threshold £12,570. Last year of compulsory Class 2.",
    period: "2023–24",
    source: NI_SRC,
  },
];

export const PAYE_RATES: RateFact[] = [
  {
    id: "paye-mpbiks",
    domain: "paye",
    label: "Mandatory payrolling of benefits in kind (MPBiKs)",
    value: "From April 2027",
    detail:
      "Employers must report and payroll most benefits in kind in real time via RTI from April 2027. Draft guidance and legislation on GOV.UK (SDST, 9 Nov 2026).",
    period: "From April 2027 (2027–28)",
    source: {
      title: "Draft guidance — reporting benefits in kind in real time",
      url: "https://www.gov.uk/guidance/draft-guidance-and-legislation-to-aid-preparation-for-reporting-benefits-in-kind-in-real-time",
      updated: "2026-11-09",
    },
  },
  {
    id: "paye-p46-car",
    domain: "paye",
    label: "P46(Car) company car reporting",
    value: "Decommissioned",
    detail:
      "HMRC is decommissioning the P46(Car) reporting method. Use RTI / mandatory BiK payrolling preparations instead. P11D / EXB 2026–27 draft working sheets (v0.2) no longer include P46(Car).",
    period: "From 6 Apr 2027",
    source: {
      title: "Draft guidance — reporting benefits in kind in real time",
      url: "https://www.gov.uk/guidance/draft-guidance-and-legislation-to-aid-preparation-for-reporting-benefits-in-kind-in-real-time",
      updated: "2026-11-09",
    },
  },
  {
    id: "paye-exb-p11d-2627",
    domain: "paye",
    label: "P11D / Expenses & Benefits 2026–27 working sheets",
    value: "Draft v0.2 (SDST)",
    detail:
      "Corrected draft working sheets issued 11 Nov 2026 (errors in 26 Oct drafts). Planned GOV.UK publication late January 2027. Use for 2026–27 EXB product build/test.",
    period: "Tax year 2026–27 · GOV.UK publish late Jan 2027",
    source: {
      title: "Budget 2026 tax-related documents",
      url: "https://www.gov.uk/government/collections/budget-2026-tax-related-documents",
      updated: "2026-11-11",
    },
  },
  {
    id: "paye-pa",
    domain: "paye",
    label: "Standard personal allowance (PAYE)",
    value: "£12,570 / year",
    detail: "£242 weekly · £1,048 monthly. Emergency codes 1257L W1/M1/X from 6 April 2025.",
    period: "2025–26",
    source: {
      title: "Rates and thresholds for employers 2025 to 2026",
      url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
    },
  },
  {
    id: "paye-basic",
    domain: "paye",
    label: "Basic rate (England & NI)",
    value: "20%",
    detail: "Up to £37,700 above the PAYE threshold.",
    period: "2025–26",
    source: {
      title: "Rates and thresholds for employers 2025 to 2026",
      url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
    },
  },
  {
    id: "ni-employee",
    domain: "ni",
    label: "Employee Class 1 NI (category A)",
    value: "8% then 2%",
    detail: "8% between primary threshold and UEL; 2% above UEL.",
    period: "2025–26",
    source: {
      title: "Rates and thresholds for employers 2025 to 2026",
      url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
    },
  },
  {
    id: "ni-employer",
    domain: "ni",
    label: "Employer Class 1 NI (category A)",
    value: "15%",
    detail: "On earnings above the secondary threshold (£5,000 / year for 2025–26).",
    period: "2025–26",
    source: {
      title: "Rates and thresholds for employers 2025 to 2026",
      url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
    },
  },
  {
    id: "ni-pt",
    domain: "ni",
    label: "Primary threshold",
    value: "£12,570 / year",
    detail: "£242 week · £1,048 month.",
    period: "2025–26",
    source: {
      title: "Rates and thresholds for employers 2025 to 2026",
      url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
    },
  },
  {
    id: "ni-uel",
    domain: "ni",
    label: "Upper earnings limit",
    value: "£50,270 / year",
    detail: "£967 week · £4,189 month.",
    period: "2025–26",
    source: {
      title: "Rates and thresholds for employers 2025 to 2026",
      url: "https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026",
    },
  },
];

export const ALL_RATES: RateFact[] = [
  ...CT_RATES,
  ...VAT_RATES,
  ...SA_RATES,
  ...PAYE_RATES,
];

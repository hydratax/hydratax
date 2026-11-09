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
    period: "From 6 Apr 2017 (still £1,000 through 2026–27)",
    source: ALLOW_SRC,
  },
  {
    id: "sa-property-allowance",
    domain: "sa",
    label: "Property income allowance",
    value: "£1,000",
    detail: "Separate £1,000 for property income; cannot combine with actual expenses on the same property business.",
    period: "From 6 Apr 2017 (still £1,000 through 2026–27)",
    source: ALLOW_SRC,
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

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

export const SA_RATES: RateFact[] = [
  {
    id: "sa-pa",
    domain: "sa",
    label: "Personal Allowance",
    value: "£12,570",
    detail: "Tapers by £1 for every £2 of income above £100,000.",
    period: "2025–26 / 2026–27",
    source: {
      title: "Income Tax rates and allowances",
      url: "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
    },
  },
  {
    id: "sa-basic",
    domain: "sa",
    label: "Basic rate (England, NI, Wales)",
    value: "20%",
    detail: "On taxable income after allowances up to £37,700.",
    period: "2025–26 / 2026–27",
    source: {
      title: "Income Tax rates and allowances",
      url: "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
    },
  },
  {
    id: "sa-higher",
    domain: "sa",
    label: "Higher rate (England, NI, Wales)",
    value: "40%",
    detail: "£37,701 to £125,140 of taxable income after allowances.",
    period: "2025–26 / 2026–27",
    source: {
      title: "Income Tax rates and allowances",
      url: "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
    },
  },
  {
    id: "sa-additional",
    domain: "sa",
    label: "Additional rate (England, NI, Wales)",
    value: "45%",
    detail: "Above £125,140 of taxable income after allowances.",
    period: "2025–26 / 2026–27",
    source: {
      title: "Income Tax rates and allowances",
      url: "https://www.gov.uk/government/publications/rates-and-allowances-income-tax/income-tax-rates-and-allowances-current-and-past",
    },
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

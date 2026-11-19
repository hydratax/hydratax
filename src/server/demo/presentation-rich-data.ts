/**
 * Fiction-only fixtures that fill every major desk for the sales demo.
 * Amounts are illustrative; never use as live client data.
 */

export const PRESENTATION_RICH_TAG = "presentation-rich-v5";

export const DEMO_ADDR = {
  london: "14 Meridian Way, London, E1 6AN",
  manchester: "8 Quay Street, Manchester, M3 3JE",
  leeds: "22 Park Row, Leeds, LS1 5HU",
};

/** Period used across CT / accounts / bank for Meridian. */
export const MERIDIAN_PERIOD = {
  start: "2025-04-01",
  end: "2026-03-31",
} as const;

/** Latest open VAT quarter for Meridian. */
export const MERIDIAN_VAT_PERIOD = {
  key: "25A4",
  start: "2025-11-01",
  end: "2026-01-31",
} as const;

export type RichPerson = {
  fullName: string;
  role:
    | "director"
    | "shareholder"
    | "director_shareholder"
    | "sole_trader"
    | "partner";
  nino: string;
  utr: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  address: string;
  occupation?: string;
  shareholdingNote?: string;
  appointedOn?: string;
};

export type RichEmployeeScenario =
  | "ordinary"
  | "ssp"
  | "smp"
  | "unpaid_absence";

export type RichEmployee = {
  forename: string;
  surname: string;
  nino: string;
  gender: "M" | "F";
  dateOfBirth: string;
  address: string;
  annualSalaryPounds: string;
  startDate: string;
  jobTitle: string;
  taxCode?: string;
  /** Demo timesheet scenario for the seeded pay period. */
  scenario?: RichEmployeeScenario;
};

export type RichBankLine = {
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: "high" | "medium" | "low";
};

export const MERIDIAN_PEOPLE: RichPerson[] = [
  {
    fullName: "Alex Meridian",
    role: "director_shareholder",
    nino: "QQ112233A",
    utr: "2255500011",
    dateOfBirth: "1982-03-14",
    email: "alex.meridian@example.com",
    phone: "07700 900201",
    address: DEMO_ADDR.london,
    occupation: "Managing director",
    shareholdingNote: "60% ordinary shares",
    appointedOn: "2020-06-01",
  },
  {
    fullName: "Jordan Ellis",
    role: "director_shareholder",
    nino: "QQ223344B",
    utr: "2255500022",
    dateOfBirth: "1988-11-02",
    email: "jordan.ellis@example.com",
    phone: "07700 900202",
    address: DEMO_ADDR.london,
    occupation: "Finance director",
    shareholdingNote: "25% ordinary shares",
    appointedOn: "2021-01-15",
  },
  {
    fullName: "Priya Shah",
    role: "shareholder",
    nino: "QQ334455C",
    utr: "2255500033",
    dateOfBirth: "1975-07-22",
    email: "priya.shah@example.com",
    phone: "07700 900203",
    address: DEMO_ADDR.manchester,
    occupation: "Investor",
    shareholdingNote: "15% ordinary shares",
  },
];

/** Ten staff with mixed wages; one SSP, one SMP, one unpaid absence for payslip demos. */
export const MERIDIAN_EMPLOYEES: RichEmployee[] = [
  {
    forename: "Sam",
    surname: "Okoye",
    nino: "QQ445566D",
    gender: "M",
    dateOfBirth: "1994-05-08",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "38500",
    startDate: "2024-04-06",
    jobTitle: "Store manager",
    scenario: "ordinary",
  },
  {
    forename: "Hannah",
    surname: "Brooks",
    nino: "QQ556677E",
    gender: "F",
    dateOfBirth: "1991-09-19",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "27400",
    startDate: "2024-06-01",
    jobTitle: "Sales assistant",
    scenario: "ssp",
  },
  {
    forename: "Luis",
    surname: "Fernandez",
    nino: "QQ667788F",
    gender: "M",
    dateOfBirth: "1997-01-30",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "22800",
    startDate: "2025-02-01",
    jobTitle: "Warehouse operative",
    scenario: "unpaid_absence",
  },
  {
    forename: "Mei",
    surname: "Chen",
    nino: "QQ778899G",
    gender: "F",
    dateOfBirth: "1990-12-12",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "41200",
    startDate: "2023-09-01",
    jobTitle: "Buyer",
    scenario: "smp",
  },
  {
    forename: "Omar",
    surname: "Haddad",
    nino: "QQ889900H",
    gender: "M",
    dateOfBirth: "1989-04-21",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "33600",
    startDate: "2024-08-12",
    jobTitle: "Supervisor",
    scenario: "ordinary",
  },
  {
    forename: "Chloe",
    surname: "Patel",
    nino: "QQ990011A",
    gender: "F",
    dateOfBirth: "1995-11-03",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "25150",
    startDate: "2025-01-06",
    jobTitle: "Cashier",
    scenario: "ordinary",
  },
  {
    forename: "Daniel",
    surname: "Wright",
    nino: "QQ101112B",
    gender: "M",
    dateOfBirth: "1986-07-17",
    address: DEMO_ADDR.manchester,
    annualSalaryPounds: "47800",
    startDate: "2022-11-01",
    jobTitle: "Operations lead",
    scenario: "ordinary",
  },
  {
    forename: "Aisha",
    surname: "Khan",
    nino: "QQ121314C",
    gender: "F",
    dateOfBirth: "1998-02-28",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "19800",
    startDate: "2025-03-17",
    jobTitle: "Apprentice retail",
    scenario: "ordinary",
  },
  {
    forename: "Tom",
    surname: "Nguyen",
    nino: "QQ151617D",
    gender: "M",
    dateOfBirth: "1993-06-09",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "30500",
    startDate: "2024-10-01",
    jobTitle: "Stock controller",
    scenario: "ordinary",
  },
  {
    forename: "Elena",
    surname: "Rossi",
    nino: "QQ181920E",
    gender: "F",
    dateOfBirth: "1992-08-14",
    address: DEMO_ADDR.london,
    annualSalaryPounds: "36250",
    startDate: "2023-05-22",
    jobTitle: "Visual merchandiser",
    scenario: "ordinary",
  },
];

/** Mixed inflows/outflows across the accounting year (gross of VAT where relevant). */
export const MERIDIAN_BANK_LINES: RichBankLine[] = [
  {
    dated: "2025-04-03",
    description: "OPENING BALANCE TRANSFER",
    amountPence: 4250000,
    category: "transfer",
    confidence: "high",
  },
  {
    dated: "2025-04-15",
    description: "CARD SALES WEEK 15",
    amountPence: 1865000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-04-18",
    description: "WHOLESALE SUPPLIES LTD",
    amountPence: -742000,
    category: "cost_of_sales",
    confidence: "high",
  },
  {
    dated: "2025-04-28",
    description: "SALARIES APRIL",
    amountPence: -980000,
    category: "salaries",
    confidence: "high",
  },
  {
    dated: "2025-05-12",
    description: "CARD SALES WEEK 19",
    amountPence: 2012000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-05-14",
    description: "RENT UNIT 4",
    amountPence: -350000,
    category: "rent_rates",
    confidence: "high",
  },
  {
    dated: "2025-05-20",
    description: "HYDRATAX ACCOUNTANCY FEE",
    amountPence: -180000,
    category: "accountancy",
    confidence: "high",
  },
  {
    dated: "2025-06-02",
    description: "ADVERTISING META ADS",
    amountPence: -64000,
    category: "advertising",
    confidence: "medium",
  },
  {
    dated: "2025-06-15",
    description: "CARD SALES WEEK 24",
    amountPence: 2248000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-06-18",
    description: "STOCK PURCHASE SUMMER",
    amountPence: -915000,
    category: "cost_of_sales",
    confidence: "high",
  },
  {
    dated: "2025-06-28",
    description: "SALARIES JUNE",
    amountPence: -980000,
    category: "salaries",
    confidence: "high",
  },
  {
    dated: "2025-07-10",
    description: "VAN FUEL SHELL",
    amountPence: -18500,
    category: "fuel",
    confidence: "medium",
  },
  {
    dated: "2025-07-22",
    description: "HMRC VAT Q1",
    amountPence: -412000,
    category: "tax",
    confidence: "high",
  },
  {
    dated: "2025-08-08",
    description: "CARD SALES WEEK 32",
    amountPence: 1987000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-08-15",
    description: "INSURANCE AVIVA",
    amountPence: -96000,
    category: "insurance",
    confidence: "high",
  },
  {
    dated: "2025-09-05",
    description: "BANK CHARGES",
    amountPence: -4500,
    category: "bank_charges",
    confidence: "high",
  },
  {
    dated: "2025-09-20",
    description: "CARD SALES WEEK 38",
    amountPence: 2156000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-10-02",
    description: "OFFICE SUPPLIES",
    amountPence: -32000,
    category: "admin_office",
    confidence: "medium",
  },
  {
    dated: "2025-10-28",
    description: "SALARIES OCTOBER",
    amountPence: -995000,
    category: "salaries",
    confidence: "high",
  },
  {
    dated: "2025-11-12",
    description: "CARD SALES WEEK 46",
    amountPence: 2433000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-11-18",
    description: "WHOLESALE SUPPLIES LTD",
    amountPence: -1104000,
    category: "cost_of_sales",
    confidence: "high",
  },
  {
    dated: "2025-12-05",
    description: "CARD SALES WEEK 49",
    amountPence: 2789000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-12-20",
    description: "SALARIES DECEMBER",
    amountPence: -1010000,
    category: "salaries",
    confidence: "high",
  },
  {
    dated: "2026-01-08",
    description: "CARD SALES WEEK 1",
    amountPence: 1892000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2026-01-15",
    description: "STOCK PURCHASE JAN",
    amountPence: -688000,
    category: "cost_of_sales",
    confidence: "high",
  },
  {
    dated: "2026-01-28",
    description: "SALARIES JANUARY",
    amountPence: -990000,
    category: "salaries",
    confidence: "high",
  },
  {
    dated: "2026-02-10",
    description: "CARD SALES WEEK 6",
    amountPence: 1675000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2026-02-14",
    description: "RENT UNIT 4",
    amountPence: -350000,
    category: "rent_rates",
    confidence: "high",
  },
  {
    dated: "2026-03-05",
    description: "CARD SALES WEEK 10",
    amountPence: 1920000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2026-03-20",
    description: "DIVIDEND A MERIDIAN",
    amountPence: -500000,
    category: "dividends",
    confidence: "high",
  },
];

export const OAK_BANK_LINES: RichBankLine[] = [
  {
    dated: "2025-11-05",
    description: "CLIENT FEE INVOICE 104",
    amountPence: 420000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-11-12",
    description: "CLIENT FEE INVOICE 105",
    amountPence: 360000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-11-20",
    description: "SOFTWARE SUBSCRIPTION",
    amountPence: -48000,
    category: "admin_office",
    confidence: "medium",
  },
  {
    dated: "2025-12-03",
    description: "CLIENT FEE INVOICE 106",
    amountPence: 510000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-12-15",
    description: "ACCOUNTANCY FEE",
    amountPence: -150000,
    category: "accountancy",
    confidence: "high",
  },
  {
    dated: "2026-01-08",
    description: "CLIENT FEE INVOICE 107",
    amountPence: 390000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2026-01-22",
    description: "TRAVEL TRAIN",
    amountPence: -12600,
    category: "travel",
    confidence: "medium",
  },
];

export const SAMIRA_BANK_LINES: RichBankLine[] = [
  {
    dated: "2025-05-02",
    description: "INVOICE 12 WEB DESIGN",
    amountPence: 250000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-06-10",
    description: "INVOICE 13 WEB DESIGN",
    amountPence: 180000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-07-01",
    description: "ADOBE CREATIVE CLOUD",
    amountPence: -5900,
    category: "admin_office",
    confidence: "high",
  },
  {
    dated: "2025-08-14",
    description: "INVOICE 14 RETAINER",
    amountPence: 320000,
    category: "turnover",
    confidence: "high",
  },
  {
    dated: "2025-09-20",
    description: "DRAWINGS",
    amountPence: -150000,
    category: "drawings",
    confidence: "high",
  },
  {
    dated: "2025-11-05",
    description: "INVOICE 15 LAUNCH SITE",
    amountPence: 480000,
    category: "turnover",
    confidence: "high",
  },
];

/** VAT boxes in pence — Box 3 = 1+2, Box 5 = |3−4|. */
export const MERIDIAN_VAT_BOXES = {
  vatDueSales: 486600,
  vatDueAcquisitions: 0,
  totalVatDue: 486600,
  vatReclaimedCurrPeriod: 221600,
  netVatDue: 265000,
  totalValueSalesExVAT: 2433000,
  totalValuePurchasesExVAT: 1108000,
  totalValueGoodsSuppliedExVAT: 0,
  totalAcquisitionsExVAT: 0,
};

export const OAK_VAT_BOXES = {
  vatDueSales: 172000,
  vatDueAcquisitions: 0,
  totalVatDue: 172000,
  vatReclaimedCurrPeriod: 39600,
  netVatDue: 132400,
  totalValueSalesExVAT: 860000,
  totalValuePurchasesExVAT: 198000,
  totalValueGoodsSuppliedExVAT: 0,
  totalAcquisitionsExVAT: 0,
};

export function digitsVrn(vrn: string | null | undefined): string | null {
  if (!vrn) return null;
  const d = vrn.replace(/\D/g, "");
  return d.length === 9 ? d : null;
}

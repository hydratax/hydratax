/**
 * Official bulk-import sample workbook definition.
 * Keep in sync with mapBulkImportRow / FIELD_ALIASES — these are the only
 * client fields HydraTax stores on import.
 */

export type BulkImportTemplateColumn = {
  /** Exact header to put in the Clients sheet (snake_case — always recognised). */
  header: string;
  /** Human label for the guide sheet */
  label: string;
  /** required | recommended | optional */
  importance: "required" | "recommended" | "optional";
  /** Who this field applies to */
  appliesTo: string;
  description: string;
  example: string;
  /** Other header names that also work */
  alsoAccepts: string[];
};

export const BULK_IMPORT_TEMPLATE_COLUMNS: BulkImportTemplateColumn[] = [
  {
    header: "name",
    label: "Client / company name",
    importance: "required",
    appliesTo: "All clients",
    description:
      "Legal or trading name shown on the desk. For limited companies you may leave this blank if company_number is set (we will use the number until you open the client).",
    example: "Example Trading Ltd",
    alsoAccepts: [
      "Company Name",
      "Client Name",
      "Legal Name",
      "Trading Name",
      "Business Name",
    ],
  },
  {
    header: "type",
    label: "Client type",
    importance: "recommended",
    appliesTo: "All clients",
    description:
      "One of: limited_company, sole_trader, partnership. If blank and company_number is present, we treat the row as a limited company.",
    example: "limited_company",
    alsoAccepts: ["Client Type", "Entity Type", "ltd", "limited", "company"],
  },
  {
    header: "company_number",
    label: "Companies House number",
    importance: "recommended",
    appliesTo: "Limited companies",
    description:
      "8-character company number (leading zeros kept). Used to match existing clients and load Companies House details when you open the client.",
    example: "12345678",
    alsoAccepts: [
      "Company Number",
      "Company No",
      "CRN",
      "Registration Number",
      "Co Number",
    ],
  },
  {
    header: "company_auth_code",
    label: "Companies House authentication code",
    importance: "optional",
    appliesTo: "Limited companies",
    description:
      "6-character CH authentication code for filings (confirmation statement, accounts, etc.). Keep secure.",
    example: "ABC123",
    alsoAccepts: [
      "Auth Code",
      "Authentication Code",
      "Company Auth Code",
      "CH Auth Code",
    ],
  },
  {
    header: "utr",
    label: "Unique Taxpayer Reference",
    importance: "optional",
    appliesTo: "Companies & sole traders",
    description: "HMRC UTR for corporation tax or self assessment.",
    example: "1234567890",
    alsoAccepts: ["UTR", "Tax Reference", "Company UTR"],
  },
  {
    header: "vrn",
    label: "VAT registration number",
    importance: "optional",
    appliesTo: "VAT-registered clients",
    description: "9-digit VRN (spaces optional). Pair with is_vat_registered = yes.",
    example: "123456789",
    alsoAccepts: ["VAT", "VAT Number", "VAT Reg", "VAT Registration"],
  },
  {
    header: "nino",
    label: "National Insurance number",
    importance: "optional",
    appliesTo: "Sole traders / individuals",
    description: "NI number for self assessment clients.",
    example: "QQ123456C",
    alsoAccepts: ["NI", "NINO", "National Insurance Number"],
  },
  {
    header: "paye_ref",
    label: "PAYE reference",
    importance: "optional",
    appliesTo: "Employers",
    description: "Employer PAYE reference (e.g. 123/AB456).",
    example: "123/AB45678",
    alsoAccepts: ["PAYE", "PAYE Ref", "PAYE Reference"],
  },
  {
    header: "accounts_office_ref",
    label: "Accounts office reference",
    importance: "optional",
    appliesTo: "Employers",
    description: "HMRC Accounts Office reference for payroll (EPS/FPS).",
    example: "123PA00012345",
    alsoAccepts: ["Accounts Office", "AO Ref", "Accounts Office Reference"],
  },
  {
    header: "contact_email",
    label: "Contact email",
    importance: "recommended",
    appliesTo: "All clients",
    description:
      "Primary email for portals, letters, and bulk email. Invalid addresses are skipped (row still imports).",
    example: "accounts@example.com",
    alsoAccepts: [
      "Email",
      "Email Address",
      "Client Email",
      "Company Email",
    ],
  },
  {
    header: "contact_phone",
    label: "Contact phone",
    importance: "recommended",
    appliesTo: "All clients",
    description: "Main telephone or mobile number.",
    example: "020 7946 0000",
    alsoAccepts: [
      "Phone",
      "Telephone",
      "Mobile",
      "Tel",
      "Phone Number",
      "Company Phone",
    ],
  },
  {
    header: "is_vat_registered",
    label: "VAT registered?",
    importance: "optional",
    appliesTo: "All clients",
    description: "yes / no (also accepts true/false, 1/0, y/n).",
    example: "yes",
    alsoAccepts: ["VAT Registered", "Is VAT", "VAT Registered Y/N"],
  },
  {
    header: "is_employer",
    label: "PAYE employer?",
    importance: "optional",
    appliesTo: "All clients",
    description: "yes / no — marks the client as running payroll.",
    example: "no",
    alsoAccepts: ["Employer", "Is Employer", "PAYE Employer"],
  },
];

/** Example rows for the Clients sheet — one ltd + one sole trader fully filled. */
export function bulkImportSampleRows(): Record<string, string>[] {
  return [
    {
      name: "Example Trading Ltd",
      type: "limited_company",
      company_number: "12345678",
      company_auth_code: "ABC123",
      utr: "1234567890",
      vrn: "123456789",
      nino: "",
      paye_ref: "123/AB45678",
      accounts_office_ref: "123PA00012345",
      contact_email: "accounts@example.com",
      contact_phone: "020 7946 0000",
      is_vat_registered: "yes",
      is_employer: "yes",
    },
    {
      name: "Amina Patel",
      type: "sole_trader",
      company_number: "",
      company_auth_code: "",
      utr: "9876543210",
      vrn: "987654321",
      nino: "QQ123456C",
      paye_ref: "",
      accounts_office_ref: "",
      contact_email: "amina@example.com",
      contact_phone: "07700 900123",
      is_vat_registered: "yes",
      is_employer: "no",
    },
    {
      name: "Northbridge Partners LLP",
      type: "partnership",
      company_number: "OC123456",
      company_auth_code: "",
      utr: "",
      vrn: "",
      nino: "",
      paye_ref: "",
      accounts_office_ref: "",
      contact_email: "partners@northbridge.example",
      contact_phone: "0161 496 0123",
      is_vat_registered: "no",
      is_employer: "no",
    },
  ];
}

export const BULK_IMPORT_NOT_STORED = [
  "Registered office / postal address",
  "Postcode, city, county, country",
  "SIC codes, incorporation date, company status",
  "Director / officer names",
  "Share capital",
  "Website, fax, free-text notes",
];

export const BULK_IMPORT_TEMPLATE_FILENAME =
  "hydratax-client-import-sample.xlsx";

import {
  HYDRA_SERVICE_FEE_POUNDS,
  formatGBP,
  hydraTotal,
} from "@/lib/pricing";

/** Official Companies House fee schedule reference */
export const CH_FEE_SOURCE = {
  title: "Companies House fees (GOV.UK)",
  url: "https://www.gov.uk/government/publications/companies-house-fees/companies-house-fees",
  note: "Statutory fees are set by Companies House. Hydra adds a separate service charge. Always verify the latest GOV.UK rate before filing.",
} as const;

export const CH_GUIDANCE = {
  confirmationStatement:
    "https://www.gov.uk/guidance/filing-your-companys-confirmation-statement",
  personalCodes:
    "https://www.gov.uk/guidance/companies-house-personal-codes-for-identity-verification",
  verifyIdentity:
    "https://www.gov.uk/guidance/verify-your-identity-for-companies-house",
  findCompany:
    "https://find-and-update.company-information.service.gov.uk/",
  fileOnline: "https://www.gov.uk/file-your-confirmation-statement-with-companies-house",
} as const;

export type ChFieldType =
  | "text"
  | "email"
  | "date"
  | "textarea"
  | "select"
  | "checkbox"
  | "personal_code_ack";

export type ChFormField = {
  name: string;
  label: string;
  type: ChFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** Stored for filing only — never shown on admin dashboards */
  sensitive?: boolean;
};

export type ChServiceDetail = {
  id: string;
  title: string;
  summary: string;
  channel: "Digital" | "Software" | "Paper";
  chFeePounds: number;
  hydraFeePounds: number;
  popular?: boolean;
  /** What Companies House requires / what this filing does */
  whatYouNeed: string[];
  importantNotes: string[];
  govUkLinks: { label: string; url: string }[];
  formFields: ChFormField[];
  requiresPersonalCodes?: boolean;
};

export const CH_SERVICE_DETAILS: ChServiceDetail[] = [
  {
    id: "incorporation",
    title: "Company incorporation",
    summary:
      "Register a new limited company with Companies House. Statutory digital / software fee is £100 (paper £124).",
    channel: "Digital",
    chFeePounds: 100,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    popular: true,
    whatYouNeed: [
      "Proposed company name (check availability on the register)",
      "Registered office address in the UK",
      "At least one director (identity verification required from 18 Nov 2025)",
      "Share capital / subscriber details",
      "SIC code(s) for intended activities",
      "Director personal code(s) once identity is verified",
    ],
    importantNotes: [
      "Directors appointed from 18 November 2025 must provide a personal code as part of incorporation / appointment.",
      "Hydra prepares the filing; identity verification itself is completed via GOV.UK One Login or an ACSP — not inside HydraTax.",
    ],
    govUkLinks: [
      { label: "Companies House fees", url: CH_FEE_SOURCE.url },
      {
        label: "Verify identity for Companies House",
        url: CH_GUIDANCE.verifyIdentity,
      },
      { label: "Personal codes guidance", url: CH_GUIDANCE.personalCodes },
      { label: "Find company information", url: CH_GUIDANCE.findCompany },
    ],
    formFields: [
      {
        name: "proposedName",
        label: "Proposed company name",
        type: "text",
        required: true,
        placeholder: "Example Trading Ltd",
      },
      {
        name: "registeredOffice",
        label: "Registered office address",
        type: "textarea",
        required: true,
      },
      {
        name: "sicCodes",
        label: "SIC code(s)",
        type: "text",
        required: true,
        placeholder: "62020",
        help: "Standard Industrial Classification — see GOV.UK SIC list",
      },
      {
        name: "shareCapital",
        label: "Share capital summary",
        type: "textarea",
        required: true,
        placeholder: "100 ordinary shares of £1",
      },
      {
        name: "directorCount",
        label: "Number of directors",
        type: "text",
        required: true,
        placeholder: "1",
      },
      {
        name: "personalCodeAck",
        label:
          "I confirm each director will verify identity via GOV.UK / ACSP and supply their personal code for filing",
        type: "personal_code_ack",
        required: true,
      },
    ],
    requiresPersonalCodes: true,
  },
  {
    id: "incorporation-same-day",
    title: "Same-day incorporation",
    summary:
      "Software same-day company registration. Statutory software fee £156. Submit before the Companies House cut-off.",
    channel: "Software",
    chFeePounds: 156,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    whatYouNeed: [
      "Same details as standard incorporation",
      "Submission before same-day cut-off",
      "Director personal codes where required",
    ],
    importantNotes: [
      "Same-day service is software-only at £156 (Companies House fees guidance).",
    ],
    govUkLinks: [
      { label: "Companies House fees", url: CH_FEE_SOURCE.url },
      { label: "Personal codes guidance", url: CH_GUIDANCE.personalCodes },
    ],
    formFields: [
      {
        name: "proposedName",
        label: "Proposed company name",
        type: "text",
        required: true,
      },
      {
        name: "registeredOffice",
        label: "Registered office address",
        type: "textarea",
        required: true,
      },
      {
        name: "cutOffAck",
        label: "I understand same-day filing must meet Companies House cut-off times",
        type: "checkbox",
        required: true,
      },
      {
        name: "personalCodeAck",
        label:
          "Directors will verify via GOV.UK / ACSP and provide personal codes for appointment",
        type: "personal_code_ack",
        required: true,
      },
    ],
    requiresPersonalCodes: true,
  },
  {
    id: "confirmation-statement",
    title: "Confirmation statement (CS01)",
    summary:
      "Confirm company information is up to date. £50 digital / software with the first statement in each 12-month payment period (£110 paper).",
    channel: "Digital",
    chFeePounds: 50,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    popular: true,
    whatYouNeed: [
      "Company number",
      "Confirmation statement date (review period)",
      "Statement that intended future activities are lawful",
      "Personal code for each director (identity verification)",
      "Email address for the company (if not already registered)",
    ],
    importantNotes: [
      "You must file at least once every 12 months even if nothing changed.",
      "From 18 November 2025, directors must have verified identity and provide personal codes on the confirmation statement.",
      "You only pay the annual fee with the first CS in the payment period.",
    ],
    govUkLinks: [
      {
        label: "Filing your confirmation statement",
        url: CH_GUIDANCE.confirmationStatement,
      },
      { label: "File online (GOV.UK)", url: CH_GUIDANCE.fileOnline },
      { label: "Companies House fees", url: CH_FEE_SOURCE.url },
      { label: "Personal codes", url: CH_GUIDANCE.personalCodes },
    ],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
        placeholder: "12345678",
      },
      {
        name: "companyName",
        label: "Company name (as on register)",
        type: "text",
        required: true,
      },
      {
        name: "confirmationDate",
        label: "Confirmation statement date",
        type: "date",
        required: true,
        help: "Check your review period on the Companies House register",
      },
      {
        name: "lawfulPurpose",
        label: "I confirm the company’s intended future activities are lawful",
        type: "checkbox",
        required: true,
      },
      {
        name: "directorPersonalCodesReady",
        label:
          "All directors have verified identity and will provide personal codes for this filing",
        type: "personal_code_ack",
        required: true,
      },
    ],
    requiresPersonalCodes: true,
  },
  {
    id: "accounts-ixbrl",
    title: "Annual accounts (iXBRL)",
    summary:
      "File statutory accounts to Companies House via software. No statutory filing fee for standard accounts delivery; Hydra service fee applies.",
    channel: "Software",
    chFeePounds: 0,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    popular: true,
    whatYouNeed: [
      "Company number",
      "Accounting period start / end",
      "iXBRL accounts file or figures for Hydra to prepare",
      "Accounts type (micro-entity, small, etc.)",
    ],
    importantNotes: [
      "Statutory CH fee for software accounts filing is £0 on the current fee schedule for standard delivery.",
      "Deadlines and accounts content remain your / your client’s responsibility under the Companies Act.",
    ],
    govUkLinks: [
      { label: "Companies House fees", url: CH_FEE_SOURCE.url },
      { label: "Find company information", url: CH_GUIDANCE.findCompany },
    ],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
      },
      {
        name: "periodStart",
        label: "Period start",
        type: "date",
        required: true,
      },
      {
        name: "periodEnd",
        label: "Period end",
        type: "date",
        required: true,
      },
      {
        name: "accountsType",
        label: "Accounts type",
        type: "select",
        required: true,
        options: [
          { value: "micro", label: "Micro-entity" },
          { value: "small", label: "Small" },
          { value: "dormant", label: "Dormant" },
          { value: "other", label: "Other" },
        ],
      },
      {
        name: "notes",
        label: "Preparation notes",
        type: "textarea",
      },
    ],
  },
  {
    id: "change-of-name",
    title: "Change of company name",
    summary: "File a company name change. Digital / software £20 (paper £30).",
    channel: "Digital",
    chFeePounds: 20,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    whatYouNeed: [
      "Company number",
      "Proposed new name",
      "Authority to change name (special resolution / articles)",
    ],
    importantNotes: ["Check name availability on the public register first."],
    govUkLinks: [
      { label: "Companies House fees", url: CH_FEE_SOURCE.url },
      { label: "Find company information", url: CH_GUIDANCE.findCompany },
    ],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
      },
      {
        name: "currentName",
        label: "Current name",
        type: "text",
        required: true,
      },
      {
        name: "newName",
        label: "Proposed new name",
        type: "text",
        required: true,
      },
    ],
  },
  {
    id: "change-of-name-same-day",
    title: "Same-day change of name",
    summary: "Expedited name change. Digital / software £85.",
    channel: "Digital",
    chFeePounds: 85,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    whatYouNeed: [
      "Company number",
      "Proposed new name",
      "Submission before same-day cut-off",
    ],
    importantNotes: ["Same-day fees per Companies House fee schedule."],
    govUkLinks: [{ label: "Companies House fees", url: CH_FEE_SOURCE.url }],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
      },
      {
        name: "newName",
        label: "Proposed new name",
        type: "text",
        required: true,
      },
      {
        name: "cutOffAck",
        label: "I understand same-day cut-off applies",
        type: "checkbox",
        required: true,
      },
    ],
  },
  {
    id: "voluntary-strike-off",
    title: "Voluntary strike off (DS01)",
    summary: "Apply to strike a company off the register. Digital £13 (paper £18).",
    channel: "Digital",
    chFeePounds: 13,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    whatYouNeed: [
      "Company number",
      "Confirmation the company is eligible to strike off",
      "Director authority",
    ],
    importantNotes: [
      "Striking off has legal consequences — ensure trading, debts, and HMRC positions are settled.",
    ],
    govUkLinks: [{ label: "Companies House fees", url: CH_FEE_SOURCE.url }],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
      },
      {
        name: "eligibilityAck",
        label: "I confirm the company meets strike-off eligibility rules",
        type: "checkbox",
        required: true,
      },
    ],
  },
  {
    id: "registration-of-charge",
    title: "Registration of a charge",
    summary: "Register a charge. Digital / software £14 (paper £24).",
    channel: "Digital",
    chFeePounds: 14,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    whatYouNeed: [
      "Company number",
      "Charge details / instrument date",
      "Persons entitled to the charge",
    ],
    importantNotes: ["Registration deadlines apply under the Companies Act."],
    govUkLinks: [{ label: "Companies House fees", url: CH_FEE_SOURCE.url }],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
      },
      {
        name: "chargeDate",
        label: "Date of charge",
        type: "date",
        required: true,
      },
      {
        name: "chargeDescription",
        label: "Brief description of charge",
        type: "textarea",
        required: true,
      },
    ],
  },
  {
    id: "certificate-incorporation",
    title: "Certificate of incorporation (post)",
    summary: "Order a certificate of incorporation by post. £22 (same-day post £65).",
    channel: "Paper",
    chFeePounds: 22,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    whatYouNeed: ["Company number", "Delivery address for the certificate"],
    importantNotes: ["Postal certificate fees per Companies House register fees."],
    govUkLinks: [{ label: "Companies House fees", url: CH_FEE_SOURCE.url }],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
      },
      {
        name: "deliveryAddress",
        label: "Postal delivery address",
        type: "textarea",
        required: true,
        sensitive: true,
      },
    ],
  },
  {
    id: "certified-copy",
    title: "Certified copy of a document",
    summary:
      "Certified copy of a filed document by post. £22 standard (£65 same-day).",
    channel: "Paper",
    chFeePounds: 22,
    hydraFeePounds: HYDRA_SERVICE_FEE_POUNDS,
    whatYouNeed: [
      "Company number",
      "Document / filing description",
      "Delivery address",
    ],
    importantNotes: [
      "Fees taken from Companies House contact centre / register certified copy rates.",
    ],
    govUkLinks: [{ label: "Companies House fees", url: CH_FEE_SOURCE.url }],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
      },
      {
        name: "documentRef",
        label: "Document / filing to certify",
        type: "text",
        required: true,
      },
      {
        name: "deliveryAddress",
        label: "Postal delivery address",
        type: "textarea",
        required: true,
        sensitive: true,
      },
    ],
  },
];

export function getChService(id: string) {
  return CH_SERVICE_DETAILS.find((s) => s.id === id);
}

export function chServiceTotal(service: ChServiceDetail) {
  return hydraTotal(service.chFeePounds);
}

export function formatChFeeBreakdown(service: ChServiceDetail) {
  return {
    statutory: formatGBP(service.chFeePounds),
    hydra: formatGBP(service.hydraFeePounds),
    total: formatGBP(chServiceTotal(service)),
  };
}

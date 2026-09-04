import {
  formatGBP,
  hydraTotal,
  type DeskPlanTier,
} from "@/lib/pricing";

/** Official Companies House fee schedule reference */
export const CH_FEE_SOURCE = {
  title: "Companies House fees (GOV.UK)",
  url: "https://www.gov.uk/government/publications/companies-house-fees/companies-house-fees",
  note: "Fees follow the current GOV.UK Companies House schedule. Always verify the latest rate before filing.",
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
      "Register a new limited company with Companies House. Digital / software fee is £100.",
    channel: "Digital",
    chFeePounds: 100,
    popular: true,
    whatYouNeed: [
      "Proposed company name (checked against the register as you type)",
      "Registered office address in the UK",
      "Directors (each with a Companies House personal code)",
      "Shareholders with share counts / percentages",
      "Mode of business and matching SIC code(s)",
    ],
    importantNotes: [
      "A personal code alone is not enough to incorporate — company details, share capital and Hydra’s software presenter account are also required.",
      "Identity verification is completed via GOV.UK One Login or an ACSP; enter the issued personal codes on this form.",
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
        name: "modeOfBusiness",
        label: "Mode of business",
        type: "text",
        required: true,
      },
      {
        name: "sicCodes",
        label: "SIC code(s)",
        type: "text",
        required: true,
      },
      {
        name: "shareCapital",
        label: "Share capital summary",
        type: "textarea",
        required: true,
      },
      {
        name: "directorsJson",
        label: "Directors",
        type: "textarea",
        required: true,
        sensitive: true,
      },
      {
        name: "shareholdersJson",
        label: "Shareholders",
        type: "textarea",
        required: true,
        sensitive: true,
      },
      {
        name: "personalCodeAck",
        label:
          "I confirm each director has verified identity via GOV.UK / ACSP and the personal codes entered are correct for filing",
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
    whatYouNeed: [
      "Same details as standard incorporation",
      "Submission before same-day cut-off",
      "Director personal codes",
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
        name: "modeOfBusiness",
        label: "Mode of business",
        type: "text",
        required: true,
      },
      {
        name: "sicCodes",
        label: "SIC code(s)",
        type: "text",
        required: true,
      },
      {
        name: "shareCapital",
        label: "Share capital summary",
        type: "textarea",
        required: true,
      },
      {
        name: "directorsJson",
        label: "Directors",
        type: "textarea",
        required: true,
        sensitive: true,
      },
      {
        name: "shareholdersJson",
        label: "Shareholders",
        type: "textarea",
        required: true,
        sensitive: true,
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
          "I confirm each director has verified identity via GOV.UK / ACSP and the personal codes entered are correct for filing",
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
      "Confirm company information is up to date. £50 digital / software with the first statement in each 12-month payment period.",
    channel: "Digital",
    chFeePounds: 50,
    popular: true,
    whatYouNeed: [
      "Company number",
      "Company authentication code (from Companies House online filing)",
      "Confirmation statement date (review period)",
      "Statement that intended future activities are lawful",
      "Personal code + date of birth for each director (identity verification)",
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
      },
      {
        name: "companyName",
        label: "Company name",
        type: "text",
        required: true,
      },
      {
        name: "companyAuthCode",
        label: "Company authentication code",
        type: "text",
        required: true,
        sensitive: true,
      },
      {
        name: "confirmationDate",
        label: "Confirmation statement date",
        type: "date",
        required: true,
      },
      {
        name: "directorsJson",
        label: "Director personal codes",
        type: "textarea",
        required: true,
        sensitive: true,
      },
      {
        name: "lawfulPurpose",
        label: "I confirm the company’s intended future activities are lawful",
        type: "checkbox",
        required: true,
      },
    ],
    requiresPersonalCodes: true,
  },
  {
    id: "accounts-ixbrl",
    title: "Annual accounts (iXBRL)",
    summary:
      "File statutory accounts to Companies House via software. No statutory filing fee for standard accounts delivery.",
    channel: "Software",
    chFeePounds: 0,
    popular: true,
    whatYouNeed: [
      "Company number",
      "Company authentication code",
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
        name: "companyAuthCode",
        label: "Company authentication code",
        type: "text",
        required: true,
        sensitive: true,
        help: "From Companies House online filing — required before payment.",
        placeholder: "Authentication code",
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
    summary: "File a company name change with Companies House.",
    channel: "Digital",
    chFeePounds: 20,
    whatYouNeed: [
      "Company number",
      "Company authentication code",
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
        name: "companyAuthCode",
        label: "Company authentication code",
        type: "text",
        required: true,
        sensitive: true,
        help: "From Companies House online filing — required before payment.",
        placeholder: "Authentication code",
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
      {
        name: "resolutionAck",
        label: "I confirm authority to change the company name",
        type: "checkbox",
        required: true,
      },
    ],
  },
  {
    id: "change-of-name-same-day",
    title: "Same-day change of name",
    summary: "Expedited company name change with Companies House.",
    channel: "Digital",
    chFeePounds: 85,
    whatYouNeed: [
      "Company number",
      "Company authentication code",
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
        name: "companyAuthCode",
        label: "Company authentication code",
        type: "text",
        required: true,
        sensitive: true,
        help: "From Companies House online filing — required before payment.",
        placeholder: "Authentication code",
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
    id: "appoint-director",
    title: "Add director",
    summary:
      "Appoint a new director (AP01). The appointee needs a Companies House personal code.",
    channel: "Software",
    chFeePounds: 0,
    whatYouNeed: [
      "Company number and authentication code",
      "Director full name, DOB, service / residential address",
      "Companies House personal code for the new director",
      "Appointment date and consent to act",
    ],
    importantNotes: [
      "Identity verification must be complete before appointment can be accepted.",
    ],
    govUkLinks: [
      { label: "Personal codes guidance", url: CH_GUIDANCE.personalCodes },
      { label: "Verify identity", url: CH_GUIDANCE.verifyIdentity },
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
        name: "companyAuthCode",
        label: "Company authentication code",
        type: "text",
        required: true,
        sensitive: true,
      },
      {
        name: "directorName",
        label: "Director full name",
        type: "text",
        required: true,
      },
      {
        name: "forename",
        label: "Forename(s)",
        type: "text",
        required: true,
      },
      {
        name: "surname",
        label: "Surname",
        type: "text",
        required: true,
      },
      {
        name: "dateOfBirth",
        label: "Date of birth",
        type: "date",
        required: true,
      },
      {
        name: "appointedOn",
        label: "Appointment date",
        type: "date",
        required: true,
      },
      {
        name: "personalCode",
        label: "Personal code",
        type: "text",
        required: true,
        sensitive: true,
        help: "11-character code from GOV.UK One Login or your ACSP",
      },
      {
        name: "residentialAddress",
        label: "Residential address",
        type: "textarea",
        required: true,
        sensitive: true,
      },
      {
        name: "consentToAct",
        label: "Director consents to act",
        type: "checkbox",
        required: true,
      },
    ],
    requiresPersonalCodes: true,
  },
  {
    id: "resign-director",
    title: "Remove director",
    summary: "File a director resignation / termination (TM01).",
    channel: "Software",
    chFeePounds: 0,
    whatYouNeed: [
      "Company number and authentication code",
      "Director name as on the register",
      "Resignation / termination date",
    ],
    importantNotes: [
      "A company must keep at least one natural person director where required.",
    ],
    govUkLinks: [
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
        name: "companyAuthCode",
        label: "Company authentication code",
        type: "text",
        required: true,
        sensitive: true,
      },
      {
        name: "directorName",
        label: "Director name (as on register)",
        type: "text",
        required: true,
      },
      {
        name: "resignedOn",
        label: "Resignation date",
        type: "date",
        required: true,
      },
      {
        name: "notes",
        label: "Notes",
        type: "textarea",
      },
    ],
  },
  {
    id: "notify-psc",
    title: "Notify PSC",
    summary:
      "Register a new person with significant control (PSC01). Required when someone gains significant control.",
    channel: "Software",
    chFeePounds: 0,
    whatYouNeed: [
      "Company number and authentication code",
      "PSC full name, date of birth, nationality, and residential address",
      "Nature of control (shareholding / voting bands)",
      "Companies House personal code after identity verification",
    ],
    importantNotes: [
      "PSC verification may also need a separate PSC verification statement depending on timing.",
    ],
    govUkLinks: [
      { label: "PSC guidance", url: "https://www.gov.uk/guidance/people-with-significant-control-pscs" },
      { label: "Personal codes guidance", url: CH_GUIDANCE.personalCodes },
    ],
    formFields: [
      { name: "companyNumber", label: "Company number", type: "text", required: true },
      { name: "companyAuthCode", label: "Company authentication code", type: "text", required: true, sensitive: true },
      { name: "forename", label: "Forename(s)", type: "text", required: true },
      { name: "surname", label: "Surname", type: "text", required: true },
      { name: "dateOfBirth", label: "Date of birth", type: "date", required: true },
      { name: "notificationDate", label: "Notification date", type: "date", required: true },
      { name: "personalCode", label: "Personal code", type: "text", required: true, sensitive: true },
      { name: "residentialAddress", label: "Residential address", type: "textarea", required: true, sensitive: true },
      { name: "naturesOfControlJson", label: "Nature of control", type: "textarea", required: true },
      { name: "consentAck", label: "PSC consent", type: "checkbox", required: true },
    ],
    requiresPersonalCodes: true,
  },
  {
    id: "change-psc",
    title: "Change PSC details",
    summary: "Update nature of control or other PSC register details (PSC04).",
    channel: "Software",
    chFeePounds: 0,
    whatYouNeed: [
      "Company number and authentication code",
      "PSC name as on the register",
      "Updated nature of control",
      "Change date",
    ],
    importantNotes: [],
    govUkLinks: [
      { label: "PSC guidance", url: "https://www.gov.uk/guidance/people-with-significant-control-pscs" },
    ],
    formFields: [
      { name: "companyNumber", label: "Company number", type: "text", required: true },
      { name: "companyAuthCode", label: "Company authentication code", type: "text", required: true, sensitive: true },
      { name: "pscName", label: "PSC name", type: "text", required: true },
      { name: "forename", label: "Forename(s)", type: "text", required: true },
      { name: "surname", label: "Surname", type: "text", required: true },
      { name: "changeDate", label: "Change date", type: "date", required: true },
      { name: "naturesOfControlJson", label: "Nature of control", type: "textarea", required: true },
    ],
  },
  {
    id: "cease-psc",
    title: "Cease PSC",
    summary:
      "Remove someone from the PSC register when they cease to have significant control (PSC07).",
    channel: "Software",
    chFeePounds: 0,
    whatYouNeed: [
      "Company number and authentication code",
      "PSC name as on the register",
      "Cessation date",
    ],
    importantNotes: [],
    govUkLinks: [
      { label: "PSC guidance", url: "https://www.gov.uk/guidance/people-with-significant-control-pscs" },
    ],
    formFields: [
      { name: "companyNumber", label: "Company number", type: "text", required: true },
      { name: "companyAuthCode", label: "Company authentication code", type: "text", required: true, sensitive: true },
      { name: "pscName", label: "PSC name", type: "text", required: true },
      { name: "forename", label: "Forename(s)", type: "text", required: true },
      { name: "surname", label: "Surname", type: "text", required: true },
      { name: "cessationDate", label: "Cessation date", type: "date", required: true },
    ],
  },
  {
    id: "return-of-allotment",
    title: "Allot new shares",
    summary:
      "File a return of allotment of shares (SH01) when the company issues new shares.",
    channel: "Software",
    chFeePounds: 0,
    whatYouNeed: [
      "Company number and authentication code",
      "Allotment date, share class, number of shares, and nominal value",
      "Allottee name and address",
      "Updated statement of capital figures",
    ],
    importantNotes: [
      "Share transfers between existing shareholders are usually handled separately from allotments of new shares.",
    ],
    govUkLinks: [
      { label: "Issue shares", url: "https://www.gov.uk/guidance/issue-shares" },
    ],
    formFields: [
      { name: "companyNumber", label: "Company number", type: "text", required: true },
      { name: "companyAuthCode", label: "Company authentication code", type: "text", required: true, sensitive: true },
      { name: "allotmentDate", label: "Allotment date", type: "date", required: true },
      { name: "shareClass", label: "Share class", type: "text", required: true },
      { name: "numShares", label: "Number of shares", type: "text", required: true },
      { name: "nominalValue", label: "Nominal value", type: "text", required: true },
      { name: "allotteeForename", label: "Allottee forename", type: "text", required: true },
      { name: "allotteeSurname", label: "Allottee surname", type: "text", required: true },
      { name: "allotteeAddress", label: "Allottee address", type: "textarea", required: true },
    ],
  },
  {
    id: "dissolve-company",
    title: "Dissolve company",
    summary:
      "Apply to strike off a company (DS01) when it is eligible for voluntary dissolution.",
    channel: "Digital",
    chFeePounds: 33,
    whatYouNeed: [
      "Company number and authentication code",
      "Confirmation the company is eligible to strike off",
      "Director / majority consent as required",
    ],
    importantNotes: [
      "Do not apply if the company is trading, has recent name changes, or other disqualifying events — check GOV.UK eligibility.",
      "Statutory fee is set by Companies House; verify the current GOV.UK rate.",
    ],
    govUkLinks: [
      {
        label: "Strike off a company",
        url: "https://www.gov.uk/strike-off-dissolve-limited-company",
      },
      { label: "Companies House fees", url: CH_FEE_SOURCE.url },
    ],
    formFields: [
      {
        name: "companyNumber",
        label: "Company number",
        type: "text",
        required: true,
      },
      {
        name: "companyAuthCode",
        label: "Company authentication code",
        type: "text",
        required: true,
        sensitive: true,
      },
      {
        name: "companyName",
        label: "Company name",
        type: "text",
        required: true,
      },
      {
        name: "eligibilityAck",
        label: "I confirm the company is eligible for voluntary strike-off",
        type: "checkbox",
        required: true,
      },
      {
        name: "notes",
        label: "Notes",
        type: "textarea",
      },
    ],
  },
];

export function getChService(id: string) {
  return CH_SERVICE_DETAILS.find((s) => s.id === id);
}

/** New company filings (IN01) — no existing company authentication code. */
export function isCompaniesHouseIncorporation(serviceId: string) {
  return (
    serviceId === "incorporation" || serviceId === "incorporation-same-day"
  );
}

/**
 * Any filing against an existing company needs the company authentication code
 * before Hydra may open checkout or queue the request.
 */
export function serviceRequiresCompanyAuthCode(serviceId: string) {
  return !isCompaniesHouseIncorporation(serviceId);
}

export const COMPANY_AUTH_CODE_FIELD: ChFormField = {
  name: "companyAuthCode",
  label: "Company authentication code",
  type: "text",
  required: true,
  sensitive: true,
  help: "From Companies House online filing — required for any change to an existing company.",
  placeholder: "Authentication code",
};

export function chServiceTotal(
  service: Pick<ChServiceDetail, "id" | "chFeePounds">,
  tier: DeskPlanTier = "solo",
) {
  return hydraTotal(service.chFeePounds, service.id, tier);
}

export function formatChServicePrice(
  service: Pick<ChServiceDetail, "id" | "chFeePounds">,
  tier: DeskPlanTier = "solo",
) {
  return formatGBP(chServiceTotal(service, tier));
}

/** @deprecated Use formatChServicePrice — returns single total only. */
export function formatChFeeBreakdown(
  service: ChServiceDetail,
  tier: DeskPlanTier = "solo",
) {
  return { total: formatChServicePrice(service, tier) };
}

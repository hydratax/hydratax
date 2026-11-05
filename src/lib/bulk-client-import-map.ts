/**
 * Map spreadsheet columns onto HydraTax client fields.
 * Headers are matched after stripping spaces/punctuation (Company Name → companyname).
 * Unknown columns are ignored.
 */

export type BulkImportMappedRow = {
  name?: string;
  type?: string;
  companyNumber?: string;
  companyAuthCode?: string;
  utr?: string;
  vrn?: string;
  nino?: string;
  payeRef?: string;
  accountsOfficeRef?: string;
  contactEmail?: string;
  contactPhone?: string;
  isVatRegistered?: string;
  isEmployer?: string;
};

/** Canonical field → accepted header aliases (already normalized). */
const FIELD_ALIASES: Record<keyof BulkImportMappedRow, string[]> = {
  name: [
    "companyname",
    "clientname",
    "organisationname",
    "organizationname",
    "legalname",
    "registeredname",
    "tradingname",
    "businessname",
    "entityname",
    "ltdname",
    "client",
    "title",
    "company",
    "name",
  ],
  type: ["type", "clienttype", "entitytype", "businesstype", "companytype"],
  companyNumber: [
    "companynumber",
    "companyno",
    "companynum",
    "conumber",
    "crn",
    "companyregistrationnumber",
    "registrationnumber",
    "regnumber",
    "regno",
    "chnumber",
    "companieshousenumber",
  ],
  companyAuthCode: [
    "companyauthcode",
    "authenticationcode",
    "authcode",
    "companyauthenticationcode",
    "chauthcode",
    "companieshouseauthcode",
  ],
  utr: ["utr", "taxreference", "uniquetaxpayerreference", "companyutr"],
  vrn: ["vrn", "vat", "vatnumber", "vatreg", "vatregistration", "vatregnumber"],
  nino: ["nino", "ni", "nationalinsurancenumber", "ninumber"],
  payeRef: ["payeref", "paye", "employeereference", "payereference"],
  accountsOfficeRef: [
    "accountsofficeref",
    "accountsoffice",
    "aoref",
    "accountsofficereference",
  ],
  contactEmail: [
    "contactemail",
    "email",
    "emailaddress",
    "clientemail",
    "companyemail",
    "e-mail",
    "mail",
  ],
  contactPhone: [
    "contactphone",
    "phone",
    "telephone",
    "tel",
    "mobile",
    "phonenumber",
    "telephonenumber",
    "mobilenumber",
    "companyphone",
    "clientphone",
    "contacttel",
    "landline",
  ],
  isVatRegistered: [
    "isvatregistered",
    "vatregistered",
    "isvat",
    "vatregyn",
    "vatregisteredyn",
  ],
  isEmployer: ["isemployer", "employer", "payeemployer", "ispayeemployer"],
};

/** Columns we deliberately do not import (shown in UI for clarity). */
const IGNORED_HINTS = [
  "address",
  "postcode",
  "postcode",
  "city",
  "town",
  "county",
  "country",
  "street",
  "line1",
  "line2",
  "sic",
  "status",
  "incorporated",
  "dissolved",
  "officer",
  "director",
  "share",
  "capital",
  "accounts",
  "confirmation",
  "website",
  "fax",
  "notes",
  "comment",
];

export function normalizeImportHeader(header: string): string {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cellToString(rawVal: unknown): string {
  if (rawVal == null) return "";
  if (typeof rawVal === "string") return rawVal.trim();
  if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
    // Avoid scientific notation for company numbers stored as numbers
    if (Number.isInteger(rawVal) && Math.abs(rawVal) < 1e15) {
      return String(rawVal);
    }
    return String(rawVal);
  }
  if (typeof rawVal === "boolean") return rawVal ? "true" : "false";
  if (rawVal instanceof Date && !Number.isNaN(rawVal.getTime())) {
    return rawVal.toISOString().slice(0, 10);
  }
  // Reject class instances / objects with methods (not server-action safe)
  if (typeof rawVal === "object") return "";
  return String(rawVal).trim();
}

function buildNormalizedRow(
  row: Record<string, unknown>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [rawKey, rawVal] of Object.entries(row)) {
    const key = normalizeImportHeader(rawKey);
    if (!key) continue;
    const val = cellToString(rawVal);
    if (!val) continue;
    // First non-empty wins; keep original if duplicate headers
    if (!map.has(key)) map.set(key, val);
  }
  return map;
}

function pick(
  map: Map<string, string>,
  aliases: string[],
): string | undefined {
  for (const a of aliases) {
    const norm = normalizeImportHeader(a);
    const v = map.get(norm);
    if (v) return v;
  }
  return undefined;
}

/** Prefer a real name over a cell that is only a company number. */
function pickName(map: Map<string, string>): string | undefined {
  const values: string[] = [];
  for (const a of FIELD_ALIASES.name) {
    const v = map.get(normalizeImportHeader(a));
    if (v && !values.includes(v)) values.push(v);
  }
  const proper = values.find((v) => !looksLikeCompanyNumber(v));
  return proper ?? values[0];
}

/** Looks like an 8-char CH company number (digits or SC/NI/OC prefix). */
function looksLikeCompanyNumber(v: string): boolean {
  const compact = v.replace(/\s/g, "").toUpperCase();
  return (
    /^\d{6,8}$/.test(compact) ||
    /^(SC|NI|OC|SO|R|IP)\d{6,8}$/i.test(compact)
  );
}

/**
 * Plain JSON-safe payload for server actions (no Date/class prototypes).
 * Call on the client before `bulkImportClients`.
 */
export function toPlainBulkImportRow(
  row: Record<string, unknown>,
): Record<string, string> {
  const mapped = mapBulkImportRow(row);
  const plain: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapped)) {
    if (value == null) continue;
    const s = String(value).trim();
    if (s) plain[key] = s;
  }
  return plain;
}

/**
 * Map one spreadsheet row to HydraTax fields. Extra columns ignored.
 */
export function mapBulkImportRow(
  row: Record<string, unknown>,
): BulkImportMappedRow {
  const map = buildNormalizedRow(row);
  const mapped: BulkImportMappedRow = {
    name: pickName(map),
    type: pick(map, FIELD_ALIASES.type),
    companyNumber: pick(map, FIELD_ALIASES.companyNumber),
    companyAuthCode: pick(map, FIELD_ALIASES.companyAuthCode),
    utr: pick(map, FIELD_ALIASES.utr),
    vrn: pick(map, FIELD_ALIASES.vrn),
    nino: pick(map, FIELD_ALIASES.nino),
    payeRef: pick(map, FIELD_ALIASES.payeRef),
    accountsOfficeRef: pick(map, FIELD_ALIASES.accountsOfficeRef),
    contactEmail: pick(map, FIELD_ALIASES.contactEmail),
    contactPhone: pick(map, FIELD_ALIASES.contactPhone),
    isVatRegistered: pick(map, FIELD_ALIASES.isVatRegistered),
    isEmployer: pick(map, FIELD_ALIASES.isEmployer),
  };

  // If "name" was actually a company number and we have no companyNumber, swap
  if (
    mapped.name &&
    !mapped.companyNumber &&
    looksLikeCompanyNumber(mapped.name)
  ) {
    mapped.companyNumber = mapped.name.replace(/\s/g, "");
    mapped.name = undefined;
  }

  // If name equals company number, drop name so CH/number fallback can use a better label later
  if (
    mapped.name &&
    mapped.companyNumber &&
    normalizeImportHeader(mapped.name) ===
      normalizeImportHeader(mapped.companyNumber)
  ) {
    mapped.name = undefined;
  }

  return mapped;
}

export type ColumnMappingPreview = {
  recognized: Array<{ header: string; field: string }>;
  ignored: string[];
};

/** Scan file headers once so the UI can show what will be imported. */
export function previewImportColumns(
  headers: string[],
): ColumnMappingPreview {
  const recognized: Array<{ header: string; field: string }> = [];
  const ignored: string[] = [];
  const usedFields = new Set<string>();

  for (const header of headers) {
    const norm = normalizeImportHeader(header);
    if (!norm) continue;

    let matchedField: string | null = null;
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some((a) => normalizeImportHeader(a) === norm)) {
        matchedField = field;
        break;
      }
    }

    if (matchedField && !usedFields.has(matchedField)) {
      usedFields.add(matchedField);
      recognized.push({ header, field: matchedField });
    } else if (matchedField && usedFields.has(matchedField)) {
      ignored.push(header);
    } else {
      ignored.push(header);
    }
  }

  // Prefer sorting ignored address-like columns first for display
  ignored.sort((a, b) => {
    const aAddr = IGNORED_HINTS.some((h) =>
      normalizeImportHeader(a).includes(h),
    );
    const bAddr = IGNORED_HINTS.some((h) =>
      normalizeImportHeader(b).includes(h),
    );
    if (aAddr !== bAddr) return aAddr ? -1 : 1;
    return a.localeCompare(b);
  });

  return { recognized, ignored };
}

export const BULK_IMPORT_FIELD_LABELS: Record<string, string> = {
  name: "Client / company name",
  type: "Type",
  companyNumber: "Company number",
  companyAuthCode: "Authentication code",
  utr: "UTR",
  vrn: "VAT number",
  nino: "NI number",
  payeRef: "PAYE reference",
  accountsOfficeRef: "Accounts office ref",
  contactEmail: "Email",
  contactPhone: "Phone",
  isVatRegistered: "VAT registered",
  isEmployer: "Employer",
};

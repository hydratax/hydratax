/** Shared types and helpers for Companies House change wizards. */

export type StructuredAddress = {
  premise: string;
  street: string;
  postTown: string;
  county: string;
  postcode: string;
  country: string;
};

export type ChCompanySnapshot = {
  companyNumber: string;
  companyName: string;
  status: string | null;
  registeredOffice: string;
  directors: { name: string; role: string | null; appointedOn: string | null }[];
  pscs: { name: string | null; naturesOfControl: string[] }[];
};

export const EMPTY_ADDRESS: StructuredAddress = {
  premise: "",
  street: "",
  postTown: "",
  county: "",
  postcode: "",
  country: "GBR",
};

/** PSC nature-of-control options (Companies House register codes). */
export const PSC_NATURE_OPTIONS = [
  {
    value: "ownership-of-shares-75-to-100-percent",
    label: "Owns 75%–100% of shares",
  },
  {
    value: "ownership-of-shares-50-to-75-percent",
    label: "Owns 50%–75% of shares",
  },
  {
    value: "ownership-of-shares-25-to-50-percent",
    label: "Owns 25%–50% of shares",
  },
  {
    value: "voting-rights-75-to-100-percent",
    label: "75%–100% voting rights",
  },
  {
    value: "voting-rights-50-to-75-percent",
    label: "50%–75% voting rights",
  },
  {
    value: "voting-rights-25-to-50-percent",
    label: "25%–50% voting rights",
  },
  {
    value: "right-to-appoint-and-remove-directors",
    label: "Right to appoint or remove directors",
  },
  {
    value: "significant-influence-or-control",
    label: "Significant influence or control",
  },
] as const;

export function emptyAddress(): StructuredAddress {
  return { ...EMPTY_ADDRESS };
}

export function addressToLines(addr: StructuredAddress): string {
  return [
    addr.premise,
    addr.street,
    addr.postTown,
    addr.county,
    addr.postcode,
    addr.country === "GBR" ? "United Kingdom" : addr.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function addressFromRecord(
  raw?: Record<string, string | undefined> | null,
): string {
  if (!raw) return "";
  return [
    raw.address_line_1,
    raw.address_line_2,
    raw.locality,
    raw.region,
    raw.postal_code,
    raw.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function splitFullName(fullName: string) {
  const cleaned = fullName.replace(/,/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { forename: parts[0] ?? "", surname: parts[0] ?? "" };
  }
  return {
    forename: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1]!,
  };
}

export function normalizeCompanyName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

export function ensureLtdSuffix(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  if (/\b(LTD|LIMITED|LLP|PLC)\b/i.test(trimmed)) return trimmed;
  return `${trimmed} Ltd`;
}

export function isValidPersonalCode(code: string) {
  return /^[A-Z0-9]{11}$/i.test(code.trim());
}

export function isValidPostcode(postcode: string) {
  return /^[A-Z]{1,2}\d[\dA-Z]?\s*\d[A-Z]{2}$/i.test(postcode.trim());
}

export function validateStructuredAddress(
  addr: StructuredAddress,
  label = "Address",
): string | null {
  if (!addr.premise.trim()) return `${label}: building name or number is required`;
  if (!addr.street.trim()) return `${label}: street is required`;
  if (!addr.postTown.trim()) return `${label}: town or city is required`;
  if (!isValidPostcode(addr.postcode)) {
    return `${label}: enter a valid UK postcode`;
  }
  return null;
}

export function parseAddressJson(raw: string): StructuredAddress {
  try {
    const parsed = JSON.parse(raw) as Partial<StructuredAddress>;
    return {
      premise: String(parsed.premise ?? "").trim(),
      street: String(parsed.street ?? "").trim(),
      postTown: String(parsed.postTown ?? "").trim(),
      county: String(parsed.county ?? "").trim(),
      postcode: String(parsed.postcode ?? "").trim().toUpperCase(),
      country: String(parsed.country ?? "GBR").trim() || "GBR",
    };
  } catch {
    return emptyAddress();
  }
}

export function stringifyAddress(addr: StructuredAddress) {
  return JSON.stringify(addr);
}

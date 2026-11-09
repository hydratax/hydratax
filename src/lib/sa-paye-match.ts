/**
 * Match a Self Assessment person to a PAYE employee.
 * All three identity checks must pass — if any fails, do not pull PAYE data.
 */

export function normalizeNino(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Accept ISO YYYY-MM-DD or DD/MM/YYYY → YYYY-MM-DD, or "" if unusable. */
export function normalizeDob(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (uk) {
    const d = uk[1]!.padStart(2, "0");
    const m = uk[2]!.padStart(2, "0");
    return `${uk[3]}-${m}-${d}`;
  }
  return "";
}

/**
 * Collapse address for comparison: lower-case, strip punctuation,
 * collapse whitespace, drop common UK fluff so minor formatting differences still match.
 */
export function normalizeAddress(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\r\n,]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(united kingdom|uk|england|scotland|wales|northern ireland)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type SaPersonIdentity = {
  nino?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
};

export type PayeEmployeeIdentity = {
  nino?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
};

export type SaPayeMatchResult = {
  matched: boolean;
  /** Which check failed — empty when matched. */
  failed: Array<"nino" | "dateOfBirth" | "address">;
};

/**
 * Strict identity match: NINO, date of birth and address must all be present
 * on both sides and equal after normalisation. Any failure → no PAYE pull.
 */
export function matchSaPersonToPayeEmployee(
  person: SaPersonIdentity,
  employee: PayeEmployeeIdentity,
): SaPayeMatchResult {
  const failed: SaPayeMatchResult["failed"] = [];

  const pNino = normalizeNino(person.nino);
  const eNino = normalizeNino(employee.nino);
  if (!pNino || !eNino || pNino !== eNino) failed.push("nino");

  const pDob = normalizeDob(person.dateOfBirth);
  const eDob = normalizeDob(employee.dateOfBirth);
  if (!pDob || !eDob || pDob !== eDob) failed.push("dateOfBirth");

  const pAddr = normalizeAddress(person.address);
  const eAddr = normalizeAddress(employee.address);
  if (!pAddr || !eAddr || pAddr !== eAddr) failed.push("address");

  return { matched: failed.length === 0, failed };
}

/** SA "2025-26" → payroll short year "25-26". */
export function saTaxYearToPayrollYear(label: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(label.trim());
  if (!m) return label.trim();
  return `${m[1]!.slice(2)}-${m[2]}`;
}

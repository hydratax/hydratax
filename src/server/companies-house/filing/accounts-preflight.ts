/**
 * Pre-flight checks for Companies House accounts filing.
 * Signing director and company identity must match the live CH register
 * for the company number being filed — never trust a bare free-text name alone.
 */
import type { ChCompanyProfile, ChOfficer } from "@/server/companies-house/api";

export type AccountsDirectorResolution =
  | {
      ok: true;
      directorName: string;
      matchedOfficerName: string;
      source: "claimed_match" | "sole_active_director";
    }
  | { ok: false; error: string };

export type AccountsIdentityCheck =
  | { ok: true; registerName: string }
  | { ok: false; error: string };

export type AccountsPeriodCheck =
  | { ok: true }
  | { ok: false; error: string };

/** Collapse CH "SURNAME, Forenames" and free-text names to comparable tokens. */
export function personNameTokens(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

export function personNamesMatch(a: string, b: string): boolean {
  const ta = personNameTokens(a);
  const tb = personNameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(" ") === tb.join(" ")) return true;
  // Allow subset when one side omitted a middle name (same token count ±1 only
  // if the shorter is fully contained in the longer).
  const [shorter, longer] =
    ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (shorter.length < 2) return false;
  return shorter.every((t) => longer.includes(t));
}

export function activeDirectors(officers: ChOfficer[]): ChOfficer[] {
  return officers.filter((o) => {
    if (o.resigned_on) return false;
    const role = (o.officer_role ?? "").toLowerCase();
    return role === "director" || role.includes("director");
  });
}

/**
 * Resolve the signing director for accounts.
 * - If a claimed name is supplied, it MUST match an active director on THIS company.
 * - If none claimed and there is exactly one active director, use that officer.
 * - Never invent a generic "Director" placeholder for live filing.
 */
export function resolveAccountsSigningDirector(input: {
  companyNumber: string;
  claimedName?: string | null;
  officers: ChOfficer[];
}): AccountsDirectorResolution {
  const companyNumber = input.companyNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const directors = activeDirectors(input.officers);
  const claimed = input.claimedName?.trim() || "";

  if (!directors.length) {
    return {
      ok: false,
      error: `Companies House lists no active directors for ${companyNumber} — cannot file accounts without a signing director on the register.`,
    };
  }

  if (claimed) {
    const match = directors.find(
      (d) => d.name && personNamesMatch(claimed, d.name),
    );
    if (!match?.name) {
      const available = directors
        .map((d) => d.name)
        .filter(Boolean)
        .join("; ");
      return {
        ok: false,
        error: `Signing director "${claimed}" is not an active director of company ${companyNumber} on Companies House. Active directors: ${available || "(none named)"}.`,
      };
    }
    // Prefer the register spelling so filings match CH.
    return {
      ok: true,
      directorName: displayDirectorName(match.name),
      matchedOfficerName: match.name,
      source: "claimed_match",
    };
  }

  if (directors.length === 1 && directors[0]?.name) {
    return {
      ok: true,
      directorName: displayDirectorName(directors[0].name),
      matchedOfficerName: directors[0].name,
      source: "sole_active_director",
    };
  }

  return {
    ok: false,
    error: `Company ${companyNumber} has ${directors.length} active directors — choose which director is signing the accounts (must match Companies House).`,
  };
}

/** "HAIDERY, Sher Ali Akbar" → "Sher Ali Akbar Haidery" for human-readable iXBRL. */
export function displayDirectorName(chName: string): string {
  const trimmed = chName.trim();
  const comma = trimmed.indexOf(",");
  if (comma <= 0) return trimmed;
  const surname = trimmed.slice(0, comma).trim();
  const forenames = trimmed.slice(comma + 1).trim();
  if (!forenames) return surname;
  const surnameTitle =
    surname.charAt(0).toUpperCase() + surname.slice(1).toLowerCase();
  return `${forenames} ${surnameTitle}`.replace(/\s+/g, " ").trim();
}

function stripCompanySuffix(name: string) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(
      /\b(LIMITED|LTD|PLC|LLP|LIMITED LIABILITY PARTNERSHIP|THE)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function assertAccountsCompanyIdentity(input: {
  companyNumber: string;
  companyName: string;
  profile: ChCompanyProfile;
}): AccountsIdentityCheck {
  const expectedNumber = (input.profile.company_number || "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  const givenNumber = input.companyNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (expectedNumber && givenNumber && expectedNumber !== givenNumber) {
    return {
      ok: false,
      error: `Company number mismatch: filing ${givenNumber} but Companies House profile is ${expectedNumber}.`,
    };
  }

  const registerName = input.profile.company_name?.trim() || "";
  if (!registerName) {
    return {
      ok: false,
      error: `Companies House returned no company name for ${givenNumber}.`,
    };
  }

  const a = stripCompanySuffix(input.companyName);
  const b = stripCompanySuffix(registerName);
  if (!a || !b || a !== b) {
    return {
      ok: false,
      error: `Company name "${input.companyName}" does not match Companies House register name "${registerName}" for ${givenNumber}.`,
    };
  }

  if (
    input.profile.company_status &&
    input.profile.company_status.toLowerCase() !== "active"
  ) {
    return {
      ok: false,
      error: `Company ${givenNumber} status is "${input.profile.company_status}" — only active companies can file accounts via this path.`,
    };
  }

  return { ok: true, registerName };
}

export function assertAccountsPeriodNotAlreadyFiled(input: {
  companyNumber: string;
  periodEnd: string;
  profile: ChCompanyProfile;
}): AccountsPeriodCheck {
  const last =
    input.profile.accounts?.last_accounts?.made_up_to ||
    input.profile.accounts?.last_accounts?.period_end_on ||
    null;
  if (last && last === input.periodEnd) {
    return {
      ok: false,
      error: `Accounts for period ending ${input.periodEnd} are already on the Companies House register for ${input.companyNumber}.`,
    };
  }

  const nextEnd =
    input.profile.accounts?.next_accounts?.period_end_on ||
    input.profile.accounts?.next_made_up_to ||
    null;
  if (nextEnd && nextEnd !== input.periodEnd) {
    return {
      ok: false,
      error: `Filing period end ${input.periodEnd} does not match Companies House next accounts period end ${nextEnd} for ${input.companyNumber}.`,
    };
  }

  return { ok: true };
}

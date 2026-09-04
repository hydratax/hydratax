import type { ChSearchItem } from "@/server/companies-house/api";

export type NameAvailabilityStatus =
  | "idle"
  | "checking"
  | "available"
  | "taken"
  | "error";

/** Display form for messages — matches Companies House checker style. */
export function displayProposedName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeProposedCompanyName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/\bLIMITED\b/g, "LTD")
    .replace(/[^A-Z0-9 ]/g, "");
}

export function ensureLtdSuffix(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  if (/\b(LTD|LIMITED|LLP|PLC)\b/i.test(trimmed)) return trimmed;
  return `${trimmed} Ltd`;
}

/** True when register title is an exact match for the proposed name (with or without Ltd). */
export function isExactRegisterMatch(proposedRaw: string, registerTitle: string) {
  const registerNorm = normalizeProposedCompanyName(registerTitle);
  const variants = new Set([
    normalizeProposedCompanyName(proposedRaw),
    normalizeProposedCompanyName(ensureLtdSuffix(proposedRaw)),
  ]);
  return variants.has(registerNorm);
}

export function evaluateNameAvailability(
  proposedRaw: string,
  items: ChSearchItem[],
  opts?: { excludeCompanyNumber?: string },
): {
  status: Exclude<NameAvailabilityStatus, "idle" | "checking" | "error">;
  message: string;
  exactMatch?: ChSearchItem;
  /** Fuzzy register hits — informational only, same as CH “similar names” panel. */
  similar: ChSearchItem[];
  checkedAs: string;
} {
  const checkedAs = displayProposedName(proposedRaw);
  const exclude = opts?.excludeCompanyNumber?.replace(/\D/g, "") ?? "";

  const activeItems = items.filter(
    (i) => (i.company_status ?? "active").toLowerCase() === "active",
  );

  const exact = activeItems.find((i) =>
    isExactRegisterMatch(proposedRaw, i.title),
  );

  const similar = activeItems.filter((i) => i !== exact).slice(0, 8);

  if (exact) {
    const exactNum = exact.company_number.replace(/\D/g, "");
    if (exclude && exactNum === exclude) {
      return {
        status: "available",
        message: "This is the company’s current registered name.",
        exactMatch: exact,
        similar,
        checkedAs,
      };
    }
    return {
      status: "taken",
      message: `“${exact.title}” (${exact.company_number}) is already on the register.`,
      exactMatch: exact,
      similar,
      checkedAs,
    };
  }

  const baseMessage = `No exact company name matches found for “${checkedAs}”.`;
  if (similar.length > 0) {
    return {
      status: "available",
      message: baseMessage,
      similar,
      checkedAs,
    };
  }

  return {
    status: "available",
    message: baseMessage,
    similar: [],
    checkedAs,
  };
}

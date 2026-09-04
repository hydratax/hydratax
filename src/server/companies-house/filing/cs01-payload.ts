import {
  csStatementOfCapitalSchema,
  type ParsedCsFilingInput,
} from "./personal-codes";

function str(payload: Record<string, unknown>, key: string) {
  const val = payload[key];
  return typeof val === "string" ? val.trim() : "";
}

export function parseCsSicCodes(payload: Record<string, unknown>): string[] {
  const raw = str(payload, "sicCodes");
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((c) => c.trim())
        .filter((c) => /^\d{5}$/.test(c)),
    ),
  ];
}

export function parseCsStatementOfCapital(
  payload: Record<string, unknown>,
): ParsedCsFilingInput["statementOfCapital"] | undefined {
  const raw = payload.statementOfCapitalJson;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = csStatementOfCapitalSchema.parse(JSON.parse(raw));
    return parsed;
  } catch {
    return undefined;
  }
}

export function resolveCsRegisteredEmail(
  payload: Record<string, unknown>,
  customerEmail?: string | null,
): string {
  const fromPayload = str(payload, "registeredEmail");
  if (fromPayload) return fromPayload;
  const fromCustomer = customerEmail?.trim() ?? "";
  if (fromCustomer) return fromCustomer;
  return "";
}

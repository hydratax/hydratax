import { looksLikeCompanyNumber, normalizeCompanyNumber } from "@/lib/company-number";

/** Never pre-fill these from URL or public defaults — credentials belong in signed-in submit flows only. */
export const CH_SENSITIVE_FORM_FIELDS = new Set([
  "companyAuthCode",
  "personalCode",
  "senderId",
  "senderPassword",
  "gatewayUserId",
  "gatewayPassword",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Build safe form defaults for public Companies House pages.
 * When signed out, only navigation flags are passed — never company or credential hints from the URL.
 */
export function sanitizePublicChFormDefaults(
  query: Record<string, string | undefined>,
  opts: { signedIn: boolean },
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const key of ["pay", "resume", "mode", "step"] as const) {
    const val = query[key]?.trim();
    if (val) out[key] = val;
  }

  if (!opts.signedIn) return out;

  const companyRaw = query.company?.trim();
  if (companyRaw && looksLikeCompanyNumber(companyRaw)) {
    const cn = normalizeCompanyNumber(companyRaw);
    out.companyNumber = cn;
    out.company_number = cn;
  }

  const clientId = query.clientId?.trim();
  if (clientId && UUID_RE.test(clientId)) {
    out.clientId = clientId;
  }

  const name = query.name?.trim();
  if (name && !/^\d{10,}$/.test(name.replace(/\s+/g, ""))) {
    out.currentName = name;
    out.companyName = name;
  }

  return out;
}

export function safeChFieldDefault(
  fieldName: string,
  defaults: Record<string, string> | undefined,
): string {
  if (!defaults) return "";
  if (CH_SENSITIVE_FORM_FIELDS.has(fieldName)) return "";
  if (fieldName === "companyNumber" || fieldName === "company_number") {
    const raw = defaults[fieldName] ?? "";
    return raw && looksLikeCompanyNumber(raw) ? normalizeCompanyNumber(raw) : "";
  }
  return defaults[fieldName] ?? "";
}

/**
 * Pure helpers that shape data-subject / client exports.
 *
 * No I/O and no `server-only` import so they can be unit-tested. Every export
 * passes through `stripSecrets` so credentials, tokens, hashes and encrypted
 * blobs can never leak into a downloaded file (UK GDPR Art 32).
 */

const SECRET_WORDS = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "secrets",
  "token",
  "tokens",
  "hash",
  "encrypted",
  "pin",
  "otp",
  "credential",
  "credentials",
  "apikey",
  "jwt",
  "signature",
  "cookie",
  "cipher",
]);

function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** True when a property name looks like it holds a secret. */
export function isSecretKey(key: string): boolean {
  const words = keyWords(key);
  if (words.some((w) => SECRET_WORDS.has(w))) return true;
  // companyAuthCode / auth_code / authCode
  if (words.includes("auth") && words.includes("code")) return true;
  if (words.includes("api") && words.includes("key")) return true;
  if (words.includes("private") && words.includes("key")) return true;
  if (words.includes("sender") && words.includes("id") && words.includes("encrypted")) {
    return true;
  }
  return false;
}

const MAX_DEPTH = 8;

/** Deep-clone `value` dropping any property whose name looks secret. */
export function stripSecrets<T>(value: T, depth = 0): T {
  if (depth > MAX_DEPTH) return undefined as T;
  if (Array.isArray(value)) {
    return value.map((v) => stripSecrets(v, depth + 1)) as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) continue;
      out[k] = stripSecrets(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Cap exported row counts so one request cannot return unbounded data. */
export function capRows<T>(rows: T[] | null | undefined, max = 5000): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.length > max ? rows.slice(0, max) : rows;
}

export type ExportMeta = {
  generatedAt: string;
  subject: string;
  scope: string;
  format: string;
  notIncluded: string[];
  controller: string;
  contact: string;
};

export type UserExportInput = {
  userId: string;
  generatedAt?: string;
  authUser: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  memberships: Record<string, unknown>[];
  mfaSettings: Record<string, unknown> | null;
  emailPreferences: Record<string, unknown>[];
  supportTickets: Record<string, unknown>[];
  featureRequests: Record<string, unknown>[];
  featureVotes: Record<string, unknown>[];
  activityLogs: Record<string, unknown>[];
  auditEvents: Record<string, unknown>[];
  teamInvites: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  securityEvents: Record<string, unknown>[];
  deletionRequests: Record<string, unknown>[];
  gatewayCredentialLinks: Record<string, unknown>[];
};

export type UserDataExport = {
  _meta: ExportMeta;
  account: Record<string, unknown> | null;
  profile: Record<string, unknown> | null;
  practiceMemberships: Record<string, unknown>[];
  twoFactorSettings: Record<string, unknown> | null;
  emailPreferences: Record<string, unknown>[];
  supportTickets: Record<string, unknown>[];
  featureRequestsAuthored: Record<string, unknown>[];
  featureVotes: Record<string, unknown>[];
  activityLogsAboutYou: Record<string, unknown>[];
  auditEventsAboutYou: Record<string, unknown>[];
  teamInvites: Record<string, unknown>[];
  ordersAndSubscriptions: Record<string, unknown>[];
  securityEventsAboutYou: Record<string, unknown>[];
  deletionRequests: Record<string, unknown>[];
  governmentGatewayLinks: Record<string, unknown>[];
};

/** Fields we keep from auth.users — never identities' tokens or password hash. */
const AUTH_USER_ALLOWED = [
  "id",
  "email",
  "phone",
  "created_at",
  "last_sign_in_at",
  "email_confirmed_at",
  "app_metadata",
  "user_metadata",
] as const;

export function shapeAuthUser(
  raw: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  const out: Record<string, unknown> = {};
  for (const k of AUTH_USER_ALLOWED) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  const identities = raw.identities;
  if (Array.isArray(identities)) {
    out.sign_in_methods = identities
      .map((i) =>
        i && typeof i === "object"
          ? (i as Record<string, unknown>).provider
          : null,
      )
      .filter((p): p is string => typeof p === "string");
  }
  return stripSecrets(out);
}

export const USER_EXPORT_NOT_INCLUDED = [
  "Passwords, password hashes, one-time-code hashes, session tokens and API keys (never exported).",
  "Encrypted Government Gateway / HMRC credentials (only the fact that a link exists is shown).",
  "Your practice's client records — your practice is the controller of those; ask the practice, or the practice owner can use 'Export client data'.",
  "Statutory records we must keep (billing, submission audit evidence) beyond what is listed above.",
];

export function shapeUserExport(
  input: UserExportInput,
  entity: { legalName: string; contact: string },
): UserDataExport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  return {
    _meta: {
      generatedAt,
      subject: input.userId,
      scope:
        "Personal data HydraTax holds about you as the signed-in account holder (UK GDPR Art 15 / 20).",
      format: "JSON (machine-readable)",
      notIncluded: USER_EXPORT_NOT_INCLUDED,
      controller: entity.legalName,
      contact: entity.contact,
    },
    account: shapeAuthUser(input.authUser),
    profile: input.profile ? stripSecrets(input.profile) : null,
    practiceMemberships: stripSecrets(capRows(input.memberships)),
    twoFactorSettings: input.mfaSettings ? stripSecrets(input.mfaSettings) : null,
    emailPreferences: stripSecrets(capRows(input.emailPreferences)),
    supportTickets: stripSecrets(capRows(input.supportTickets)),
    featureRequestsAuthored: stripSecrets(capRows(input.featureRequests)),
    featureVotes: stripSecrets(capRows(input.featureVotes)),
    activityLogsAboutYou: stripSecrets(capRows(input.activityLogs)),
    auditEventsAboutYou: stripSecrets(capRows(input.auditEvents)),
    teamInvites: stripSecrets(capRows(input.teamInvites)),
    ordersAndSubscriptions: stripSecrets(capRows(input.orders)),
    securityEventsAboutYou: stripSecrets(capRows(input.securityEvents)),
    deletionRequests: stripSecrets(capRows(input.deletionRequests)),
    governmentGatewayLinks: stripSecrets(capRows(input.gatewayCredentialLinks)),
  };
}

export type ClientExportInput = {
  clientId: string;
  practiceId: string;
  generatedAt?: string;
  client: Record<string, unknown> | null;
  employees: Record<string, unknown>[];
  payRuns: Record<string, unknown>[];
  timesheets: Record<string, unknown>[];
  ledgerEntries: Record<string, unknown>[];
  vatReturns: Record<string, unknown>[];
  ct600Returns: Record<string, unknown>[];
  saSubmissions: Record<string, unknown>[];
  bankTransactions: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  emailLogs: Record<string, unknown>[];
  channelMessages: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  auditEvents: Record<string, unknown>[];
};

export type ClientDataExport = {
  _meta: ExportMeta & { practiceId: string; clientId: string };
  client: Record<string, unknown> | null;
  employees: Record<string, unknown>[];
  payRuns: Record<string, unknown>[];
  timesheets: Record<string, unknown>[];
  ledgerEntries: Record<string, unknown>[];
  vatReturns: Record<string, unknown>[];
  corporationTaxReturns: Record<string, unknown>[];
  selfAssessmentSubmissions: Record<string, unknown>[];
  bankTransactions: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  emailLog: Record<string, unknown>[];
  channelMessages: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  auditTrail: Record<string, unknown>[];
};

export function shapeClientExport(
  input: ClientExportInput,
  entity: { legalName: string; contact: string },
): ClientDataExport {
  return {
    _meta: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      subject: `client:${input.clientId}`,
      practiceId: input.practiceId,
      clientId: input.clientId,
      scope:
        "All client data HydraTax holds for this client on behalf of your practice (controller: your practice; processor: HydraTax).",
      format: "JSON (machine-readable). Uploaded files are listed by metadata; download them from the Documents tab.",
      notIncluded: [
        "HMRC OAuth tokens, Government Gateway credentials, Companies House authentication codes and payroll pack passwords (never exported).",
        "Client portal access tokens.",
        "Binary document contents (metadata only).",
      ],
      controller: "Your practice (data controller)",
      contact: entity.contact,
    },
    client: input.client ? stripSecrets(input.client) : null,
    employees: stripSecrets(capRows(input.employees)),
    payRuns: stripSecrets(capRows(input.payRuns)),
    timesheets: stripSecrets(capRows(input.timesheets)),
    ledgerEntries: stripSecrets(capRows(input.ledgerEntries, 20000)),
    vatReturns: stripSecrets(capRows(input.vatReturns)),
    corporationTaxReturns: stripSecrets(capRows(input.ct600Returns)),
    selfAssessmentSubmissions: stripSecrets(capRows(input.saSubmissions)),
    bankTransactions: stripSecrets(capRows(input.bankTransactions, 50000)),
    documents: stripSecrets(capRows(input.documents)),
    invoices: stripSecrets(capRows(input.invoices)),
    emailLog: stripSecrets(capRows(input.emailLogs)),
    channelMessages: stripSecrets(capRows(input.channelMessages)),
    tasks: stripSecrets(capRows(input.tasks)),
    auditTrail: stripSecrets(capRows(input.auditEvents)),
  };
}

/** Safe download filename — no user-controlled characters. */
export function exportFilename(
  kind: "my-data" | "client-data",
  id: string,
  now = new Date(),
): string {
  const safe = id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) || "export";
  return `hydratax-${kind}-${safe}-${now.toISOString().slice(0, 10)}.json`;
}

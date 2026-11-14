/**
 * HydraTax data-retention & erasure policy (UK GDPR Art 5(1)(e), Art 17, Art 30).
 *
 * This is the single source of truth used by:
 *   - the Privacy Notice retention table (/privacy)
 *   - the retention job (`src/server/privacy/retention.ts`)
 *   - the erasure services (`src/server/privacy/*`)
 *   - docs/security/ropa.md (kept in sync by hand; see tests)
 *
 * Roles
 *   controller — HydraTax decides purposes (its own customers' account data).
 *   processor  — HydraTax processes practice-customers' client data on their
 *                documented instructions (UK GDPR Art 28). The practice is the
 *                controller and decides how long client records are kept; the
 *                platform defaults below apply only where no instruction exists.
 *
 * Statutory figures (checked against GOV.UK):
 *   - Limited company records: 6 years from the end of the last company
 *     financial year they relate to.
 *     https://www.gov.uk/running-a-limited-company/company-and-accounting-records
 *   - Self Assessment records: at least 5 years after the 31 January
 *     submission deadline of the relevant tax year.
 *     https://www.gov.uk/self-employed-records/how-long-to-keep-your-records
 *   - PAYE / payroll records: 3 years from the end of the tax year they
 *     relate to.
 *     https://www.gov.uk/paye-for-employers/keeping-records
 *   - VAT records: 6 years (VAT Notice 700/21).
 *     https://www.gov.uk/government/publications/vat-notice-70021-keeping-vat-records
 *   - Corporation Tax record keeping: Finance Act 1998 Sch 18 para 21
 *     (6 years from the end of the accounting period).
 *
 * "7 years" below means "6 years statutory minimum + up to 12 months so the
 * period is always measured from the end of the period, not from row
 * creation". Owner / counsel must confirm these defaults.
 */

export type RetentionRole = "controller" | "processor";

export type LawfulBasis =
  | "contract"
  | "legal_obligation"
  | "legitimate_interests"
  | "consent"
  /** Processor: lawful basis is the customer's (controller's) own basis. */
  | "controller_instruction";

export type ErasureBehaviour =
  /** Row/file is deleted when the data subject or practice erases. */
  | "delete"
  /** Personal fields are blanked; the non-personal row is kept. */
  | "anonymise"
  /** Kept for the statutory period then deleted by the retention job. */
  | "retain_then_delete"
  /** Deleted automatically by the retention job after the period. */
  | "automatic_purge"
  /** The practice (controller) decides; platform deletes on instruction. */
  | "practice_controlled";

export type RetentionCategory = {
  id: string;
  label: string;
  role: RetentionRole;
  dataSubjects: string;
  dataTypes: string[];
  purpose: string;
  lawfulBasis: LawfulBasis[];
  retention: {
    /** Human description shown in the Privacy Notice. */
    description: string;
    /** Concrete number of days when time-based; null = life of relationship. */
    days: number | null;
    /** What starts the clock (required when days is null or non-obvious). */
    trigger: string;
  };
  erasure: ErasureBehaviour;
  erasureNotes: string;
  /** Tables / stores holding the data (for ROPA + erase coverage review). */
  stores: string[];
  /** Official sources for legal-obligation periods. */
  sourceUrls: string[];
};

const YEAR = 365;

/** Tunables used by the retention job (single place to change policy). */
export const RETENTION_DAYS = {
  mfaChallengesHours: 24,
  emailLogsDays: 6 * YEAR,
  adminEmailLogsDays: 1 * YEAR,
  activityLogsDays: 1 * YEAR,
  supportTicketsAfterResolutionDays: 3 * YEAR,
  featureRequestAuthorEmailDays: 1 * YEAR,
  securityEventsDays: 1 * YEAR,
  botSessionsIdleDays: 30,
  teamInviteAcceptedDays: 30,
  teamInvitePendingDays: 30,
  webhookDedupeDays: 30,
  auditEventsDays: 7 * YEAR,
  billingRecordsDays: 7 * YEAR,
  dataSubjectRequestLogDays: 6 * YEAR,
  accountDeletionGraceDays: 14,
  accountDeletionRecordDays: 6 * YEAR,
} as const;

export const RETENTION_POLICY: RetentionCategory[] = [
  {
    id: "account_identity",
    label: "Account & profile (name, email, practice membership, role)",
    role: "controller",
    dataSubjects: "Practice owners, administrators and team members",
    dataTypes: ["name", "email address", "practice name", "role / module access"],
    purpose: "Create and run your HydraTax account and authenticate you.",
    lawfulBasis: ["contract"],
    retention: {
      description:
        "For as long as your account is open. Self-service deletion removes it immediately, or after a 14-day cancellation window if you are a sole practice owner.",
      days: null,
      trigger: "Account closure / deletion request",
    },
    erasure: "delete",
    erasureNotes:
      "Auth user, profile and membership rows are deleted; free-text authored by you is anonymised.",
    stores: ["auth.users", "profiles", "practice_members", "practices"],
    sourceUrls: [],
  },
  {
    id: "mfa_settings",
    label: "Two-factor settings (channel, backup email, mobile number)",
    role: "controller",
    dataSubjects: "Account holders who enable 2FA",
    dataTypes: ["2FA channel", "alternative email", "mobile number"],
    purpose: "Protect accounts with a second factor (UK GDPR Art 32).",
    lawfulBasis: ["legitimate_interests", "contract"],
    retention: {
      description: "Until you disable 2FA or delete your account.",
      days: null,
      trigger: "2FA disabled / account deletion",
    },
    erasure: "delete",
    erasureNotes: "Deleted on account erasure. Secrets and code hashes are never exported.",
    stores: ["user_mfa_settings"],
    sourceUrls: [],
  },
  {
    id: "mfa_challenges",
    label: "One-time sign-in codes (hashed)",
    role: "controller",
    dataSubjects: "Account holders using email / SMS 2FA",
    dataTypes: ["code hash", "masked destination", "expiry"],
    purpose: "Verify a sign-in attempt.",
    lawfulBasis: ["legitimate_interests"],
    retention: {
      description: "24 hours (codes expire within minutes).",
      days: 1,
      trigger: "Creation time",
    },
    erasure: "automatic_purge",
    erasureNotes: "Purged by the retention job; deleted immediately on account erasure.",
    stores: ["mfa_challenges"],
    sourceUrls: [],
  },
  {
    id: "billing_records",
    label: "Orders, subscription and invoice records",
    role: "controller",
    dataSubjects: "Account holders / purchasers",
    dataTypes: ["billing email", "plan", "amounts", "Stripe customer / subscription IDs"],
    purpose: "Take payment, issue invoices and keep our own accounts and VAT records.",
    lawfulBasis: ["contract", "legal_obligation"],
    retention: {
      description:
        "7 years from the transaction (6 years from the end of the accounting period per HMRC / Companies Act record-keeping).",
      days: RETENTION_DAYS.billingRecordsDays,
      trigger: "Date of the transaction",
    },
    erasure: "retain_then_delete",
    erasureNotes:
      "Erasure does not remove statutory financial records (UK GDPR Art 17(3)(b)); they are restricted to accounting use and the link to the deleted practice is removed.",
    stores: ["checkout_orders", "practice_subscriptions", "Stripe (external)"],
    sourceUrls: [
      "https://www.gov.uk/running-a-limited-company/company-and-accounting-records",
      "https://www.gov.uk/government/publications/vat-notice-70021-keeping-vat-records",
    ],
  },
  {
    id: "support_tickets",
    label: "Support tickets and correspondence with us",
    role: "controller",
    dataSubjects: "People who contact support",
    dataTypes: ["name / email", "message content", "page URL", "attachments (by email only)"],
    purpose: "Answer queries, fix problems and defend or evidence disputes.",
    lawfulBasis: ["legitimate_interests", "contract"],
    retention: {
      description: "3 years after the ticket is resolved.",
      days: RETENTION_DAYS.supportTicketsAfterResolutionDays,
      trigger: "Ticket resolved / closed",
    },
    erasure: "anonymise",
    erasureNotes:
      "On account deletion the author link is removed; text is deleted by the retention job after the period (or immediately when the practice is erased).",
    stores: ["support_tickets", "support mailbox (info@)"],
    sourceUrls: [],
  },
  {
    id: "feature_requests",
    label: "Public feature requests and votes",
    role: "controller",
    dataSubjects: "Account holders who post or vote",
    dataTypes: ["display name", "optional email", "request text", "voter key"],
    purpose: "Collect product feedback.",
    lawfulBasis: ["legitimate_interests"],
    retention: {
      description:
        "Request text until removed; the optional author email is deleted after 12 months.",
      days: RETENTION_DAYS.featureRequestAuthorEmailDays,
      trigger: "Date posted",
    },
    erasure: "anonymise",
    erasureNotes:
      "Author name becomes 'Former user', email and user id are removed; the request text may remain as product feedback.",
    stores: ["feature_requests", "feature_votes"],
    sourceUrls: [],
  },
  {
    id: "email_preferences",
    label: "Email preferences & unsubscribe records",
    role: "controller",
    dataSubjects: "Account holders / recipients of our emails",
    dataTypes: ["reminder / marketing preferences", "unsubscribe token", "unsubscribe timestamp"],
    purpose: "Send service reminders and honour marketing opt-outs (PECR).",
    lawfulBasis: ["contract", "consent", "legitimate_interests"],
    retention: {
      description: "Until you delete your account.",
      days: null,
      trigger: "Account deletion",
    },
    erasure: "delete",
    erasureNotes: "Deleted on account erasure.",
    stores: ["email_preferences"],
    sourceUrls: [],
  },
  {
    id: "security_events",
    label: "Security events (sign-in anomalies, data exports, erasures)",
    role: "controller",
    dataSubjects: "Account holders, team members",
    dataTypes: ["event type", "user id", "hashed IP address", "timestamp"],
    purpose: "Detect, investigate and document security incidents (UK GDPR Art 32, 33(5)).",
    lawfulBasis: ["legitimate_interests", "legal_obligation"],
    retention: {
      description: "12 months (breach register entries are kept for 6 years).",
      days: RETENTION_DAYS.securityEventsDays,
      trigger: "Event time",
    },
    erasure: "automatic_purge",
    erasureNotes:
      "Append-only; rows are removed only by the retention function. User ids are retained pseudonymously until expiry.",
    stores: ["security_events"],
    sourceUrls: [],
  },
  {
    id: "dsar_register",
    label: "Data-rights request register and deletion requests",
    role: "controller",
    dataSubjects: "People who exercise UK GDPR rights",
    dataTypes: ["requester email", "request type", "dates", "outcome"],
    purpose: "Meet and evidence the one-month response duty (UK GDPR Art 12).",
    lawfulBasis: ["legal_obligation", "legitimate_interests"],
    retention: {
      description: "6 years (limitation period for claims).",
      days: RETENTION_DAYS.dataSubjectRequestLogDays,
      trigger: "Request closed",
    },
    erasure: "retain_then_delete",
    erasureNotes: "Kept as evidence of compliance, then deleted.",
    stores: ["data_subject_requests", "account_deletion_requests"],
    sourceUrls: ["https://www.legislation.gov.uk/ukpga/1980/58/section/5"],
  },
  {
    id: "practice_activity_logs",
    label: "Practice activity log (who did what in the desk)",
    role: "processor",
    dataSubjects: "Practice team members",
    dataTypes: ["actor user id / email", "action summary", "client reference"],
    purpose: "Give practice administrators an operational audit trail.",
    lawfulBasis: ["controller_instruction"],
    retention: {
      description: "12 months.",
      days: RETENTION_DAYS.activityLogsDays,
      trigger: "Event time",
    },
    erasure: "automatic_purge",
    erasureNotes: "Purged after 12 months; actor email is blanked when the user is erased.",
    stores: ["practice_activity_logs"],
    sourceUrls: [],
  },
  {
    id: "client_identity",
    label: "Client records (name, UTR, NINO, VRN, contact, Companies House data)",
    role: "processor",
    dataSubjects: "The practice's clients, directors, partners, sole traders",
    dataTypes: ["name", "UTR", "NINO", "date of birth", "address", "email", "phone"],
    purpose: "Prepare and submit the filings the practice instructs.",
    lawfulBasis: ["controller_instruction"],
    retention: {
      description:
        "Until the practice removes the client or closes its account. The practice decides how long its own records are kept.",
      days: null,
      trigger: "Practice instruction (client removed / account closed)",
    },
    erasure: "practice_controlled",
    erasureNotes:
      "Owners/admins can export or erase a client from the client page; all desk tables, documents and R2 objects are removed.",
    stores: ["clients", "desk_profile (jsonb)", "client_storage_documents"],
    sourceUrls: [],
  },
  {
    id: "payroll_data",
    label: "Payroll & employee data held for client employers",
    role: "processor",
    dataSubjects: "Employees of the practice's clients",
    dataTypes: ["name", "NINO", "date of birth", "address", "pay and deductions", "tax code"],
    purpose: "Run PAYE / RTI (FPS, EPS) for the client.",
    lawfulBasis: ["controller_instruction"],
    retention: {
      description:
        "Employers must keep payroll records for 3 years from the end of the tax year; the practice decides. We hold them until the practice instructs deletion.",
      days: 3 * YEAR,
      trigger: "End of the tax year (statutory minimum — practice-controlled)",
    },
    erasure: "practice_controlled",
    erasureNotes:
      "Erasing a client removes employees, pay runs and timesheets in Supabase and Cloudflare D1.",
    stores: ["employees", "pay_runs", "payroll_timesheets (Supabase / D1)"],
    sourceUrls: ["https://www.gov.uk/paye-for-employers/keeping-records"],
  },
  {
    id: "filing_records",
    label: "Returns & ledgers (VAT, CT600, Self Assessment, accounts, bank transactions)",
    role: "processor",
    dataSubjects: "Clients and their officers / proprietors",
    dataTypes: ["financial figures", "bank transactions", "HMRC receipts"],
    purpose: "Prepare filings and keep supporting evidence for the practice.",
    lawfulBasis: ["controller_instruction"],
    retention: {
      description:
        "Statutory minimums: companies 6 years from the end of the financial year; Self Assessment 5 years after the 31 January deadline; VAT 6 years. We hold until the practice instructs deletion.",
      days: 6 * YEAR,
      trigger: "End of accounting period / tax year (practice-controlled)",
    },
    erasure: "practice_controlled",
    erasureNotes:
      "Client erasure requires the practice to acknowledge statutory retention when submitted returns exist; export first.",
    stores: [
      "vat_returns",
      "ct600_returns",
      "sa_submissions",
      "ledger_entries",
      "bank_transactions (Supabase / D1)",
    ],
    sourceUrls: [
      "https://www.gov.uk/running-a-limited-company/company-and-accounting-records",
      "https://www.gov.uk/self-employed-records/how-long-to-keep-your-records",
      "https://www.gov.uk/government/publications/vat-notice-70021-keeping-vat-records",
    ],
  },
  {
    id: "client_documents",
    label: "Uploaded client documents (files)",
    role: "processor",
    dataSubjects: "Clients and third parties named in documents",
    dataTypes: ["scans, statements, invoices, ID evidence uploaded by the practice"],
    purpose: "Store supporting documents for the practice.",
    lawfulBasis: ["controller_instruction"],
    retention: {
      description: "Until the practice deletes the document or client.",
      days: null,
      trigger: "Practice instruction",
    },
    erasure: "practice_controlled",
    erasureNotes: "File objects in Cloudflare R2 / Supabase Storage are deleted with the client.",
    stores: ["client_documents", "Cloudflare R2", "Supabase Storage"],
    sourceUrls: [],
  },
  {
    id: "client_correspondence",
    label: "Client emails, WhatsApp messages and task inbox",
    role: "processor",
    dataSubjects: "Clients and third-party senders",
    dataTypes: ["email addresses", "message previews", "attachments metadata"],
    purpose: "Record correspondence the practice sends/receives through HydraTax.",
    lawfulBasis: ["controller_instruction"],
    retention: {
      description:
        "6 years from sending, aligned with typical practice record-keeping; the practice may delete earlier.",
      days: RETENTION_DAYS.emailLogsDays,
      trigger: "Message date",
    },
    erasure: "automatic_purge",
    erasureNotes: "Purged by the retention job after the period and deleted with the client.",
    stores: ["client_email_logs", "client_channel_messages", "practice_tasks"],
    sourceUrls: [],
  },
  {
    id: "hmrc_credentials",
    label: "HMRC OAuth tokens and Government Gateway credentials (encrypted)",
    role: "processor",
    dataSubjects: "Practice users and clients",
    dataTypes: ["OAuth access/refresh tokens", "encrypted gateway user id / password"],
    purpose: "Submit to HMRC on the practice's instruction.",
    lawfulBasis: ["controller_instruction"],
    retention: {
      description: "Until disconnected, replaced, or the client / account is erased.",
      days: null,
      trigger: "Disconnect / erasure",
    },
    erasure: "delete",
    erasureNotes: "Cascade-deleted with the client or user. Never included in exports.",
    stores: ["hmrc_connections", "user_gateway_credentials"],
    sourceUrls: [],
  },
  {
    id: "audit_events",
    label: "Submission audit evidence (hash-chained)",
    role: "processor",
    dataSubjects: "Practice users and clients (pseudonymous ids)",
    dataTypes: ["actor id", "action", "entity id", "HMRC status / correlation id", "payload hash"],
    purpose:
      "Evidence that a filing was prepared and submitted, and tamper-evidence for disputes with HMRC.",
    lawfulBasis: ["legal_obligation", "legitimate_interests", "controller_instruction"],
    retention: {
      description: "7 years from the event.",
      days: RETENTION_DAYS.auditEventsDays,
      trigger: "Event time",
    },
    erasure: "retain_then_delete",
    erasureNotes:
      "Not deleted on client/account erasure (statutory evidence, Art 17(3)(b)/(e)); entries are pseudonymous. Do not put names in `detail`.",
    stores: ["audit_events"],
    sourceUrls: [
      "https://www.gov.uk/running-a-limited-company/company-and-accounting-records",
    ],
  },
  {
    id: "operational_dedupe",
    label: "Webhook de-duplication and WhatsApp bot session state",
    role: "controller",
    dataSubjects: "Webhook senders, WhatsApp users (phone number in bot sessions)",
    dataTypes: ["event ids", "phone number", "session stage"],
    purpose: "Process each external event once and hold conversation state.",
    lawfulBasis: ["legitimate_interests", "controller_instruction"],
    retention: {
      description: "30 days (bot sessions: 30 days after last activity).",
      days: RETENTION_DAYS.webhookDedupeDays,
      trigger: "Event / last activity",
    },
    erasure: "automatic_purge",
    erasureNotes: "Purged by the retention job.",
    stores: ["bot_sessions", "webhook event tables (if present)"],
    sourceUrls: [],
  },
  {
    id: "team_invites",
    label: "Pending team invitations",
    role: "controller",
    dataSubjects: "People invited to a practice",
    dataTypes: ["email", "display name", "invite token"],
    purpose: "Let a practice owner invite a colleague.",
    lawfulBasis: ["legitimate_interests", "contract"],
    retention: {
      description: "30 days if not accepted; accepted invites are purged after 30 days.",
      days: RETENTION_DAYS.teamInvitePendingDays,
      trigger: "Invitation created / accepted",
    },
    erasure: "automatic_purge",
    erasureNotes: "Purged by the retention job.",
    stores: ["practice_team_invites"],
    sourceUrls: [],
  },
  {
    id: "browser_storage",
    label: "Cookies & browser storage (strictly necessary only)",
    role: "controller",
    dataSubjects: "Website visitors and signed-in users",
    dataTypes: ["session cookies", "security cookies", "form drafts", "HMRC fraud-prevention device id"],
    purpose: "Sign-in, 2FA, security, saved drafts and HMRC-mandated fraud-prevention headers.",
    lawfulBasis: ["legitimate_interests", "legal_obligation"],
    retention: {
      description: "Session or up to the lifetimes listed on /legal/cookies; you can clear browser storage at any time.",
      days: null,
      trigger: "Cookie / storage expiry",
    },
    erasure: "delete",
    erasureNotes: "Cleared on sign-out where applicable; user can clear in browser.",
    stores: ["browser cookies", "localStorage"],
    sourceUrls: [
      "https://developer.service.hmrc.gov.uk/guides/fraud-prevention/",
    ],
  },
];

export function getRetentionCategory(id: string): RetentionCategory | undefined {
  return RETENTION_POLICY.find((c) => c.id === id);
}

/** Categories where a Privacy-Notice reader would expect a numeric period. */
export function retentionSummaryRows() {
  return RETENTION_POLICY.map((c) => ({
    id: c.id,
    label: c.label,
    role: c.role,
    retention: c.retention.description,
    basis: c.lawfulBasis,
  }));
}

export const LAWFUL_BASIS_LABEL: Record<LawfulBasis, string> = {
  contract: "Contract (Art 6(1)(b))",
  legal_obligation: "Legal obligation (Art 6(1)(c))",
  legitimate_interests: "Legitimate interests (Art 6(1)(f))",
  consent: "Consent (Art 6(1)(a))",
  controller_instruction: "Customer's instructions (Art 28)",
};

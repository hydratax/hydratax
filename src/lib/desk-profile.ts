import type { OnboardingFormRecord } from "@/lib/onboarding-forms";
import type { LetterTemplateKey } from "@/lib/letter-templates";
import type { BankLedger } from "@/lib/bank-ledger";
import type { SaTaxpayer } from "@/lib/sa-taxpayer";
import type {
  ClientWorkLogEntry,
  ClientWorkStage,
} from "@/lib/client-work-stage";

export type AmlRisk = "low" | "medium" | "high";

export type ClientLetterRecord = {
  id: string;
  templateKey: LetterTemplateKey | "custom";
  title: string;
  body: string;
  status: "draft" | "sent";
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
  activity?: Array<{
    id: string;
    at: string;
    kind: "created" | "amended" | "sent";
    actorId?: string;
    note?: string;
  }>;
};

export type AmlRecord = {
  risk: AmlRisk;
  idVerifiedOn: string;
  nextReviewOn: string;
  reviewer: string;
  notes: string;
  updatedAt: string;
};

export type EngagementRecord = {
  status: "draft" | "issued" | "signed";
  feePounds: number;
  services: string[];
  issuedOn: string;
  signedOn: string;
};

export type PortalRequest = {
  id: string;
  label: string;
  done: boolean;
};

export type PortalUpload = {
  filename: string;
  documentId: string;
  uploadedAt: string;
  /** Which checklist item this upload relates to, e.g. bank */
  requestId?: string;
};

export type PortalApprovalPack = {
  title: string;
  message?: string;
  documentId?: string;
  documentUrl?: string;
  filename?: string;
  sentAt: string;
};

/** Letter of engagement e-sign on the client portal (no third-party vendor). */
export type PortalSignRequest = {
  id: string;
  title: string;
  message?: string;
  documentId?: string;
  documentUrl?: string;
  filename?: string;
  status: "pending" | "signed" | "declined";
  createdAt: string;
  signedAt?: string;
  declinedAt?: string;
  signerName?: string;
  /** Drawn signature as PNG data URL, or empty when typed-only */
  signatureDataUrl?: string;
  typedName?: string;
  ip?: string;
  userAgent?: string;
};

export type PortalRecord = {
  token: string;
  requests: PortalRequest[];
  approveAccounts: boolean;
  approveCt600: boolean;
  approveVat: boolean;
  approveAccountsAt?: string;
  approveCt600At?: string;
  approveVatAt?: string;
  uploads?: PortalUpload[];
  /** Drafts the accountant pushed to the client for review/approval */
  approvalPacks?: {
    accounts?: PortalApprovalPack;
    ct600?: PortalApprovalPack;
    vat?: PortalApprovalPack;
  };
  /** Documents / engagement letters awaiting client signature */
  signRequests?: PortalSignRequest[];
};

export function portalApprovalMissing(
  portal: PortalRecord | null | undefined,
  kind: "accounts" | "ct600" | "vat",
): boolean {
  if (!portal?.token) return false;
  if (kind === "accounts") return !portal.approveAccounts;
  if (kind === "ct600") return !portal.approveCt600;
  return !portal.approveVat;
}

export type JobStatus = "waiting_client" | "in_review" | "ready" | "filed";

/** HydraTax desk keys for the four agent-auth categories. */
export type AgentAuthServiceKey =
  | "mtd_it"
  | "mtd_vat"
  | "corporation_tax"
  | "paye";

export type AgentAuthorisationStatus =
  | "not_requested"
  | "pending"
  | "authorised"
  | "rejected"
  | "expired"
  | "deauthorised";

export type AgentAuthorisationRecord = {
  status: AgentAuthorisationStatus;
  /** HMRC invitation id when created via Agent Authorisation API. */
  invitationId?: string | null;
  /** Client-facing authorise URL (MTD digital handshake). */
  clientActionUrl?: string | null;
  /** When the invitation expires (ISO). */
  expiresAt?: string | null;
  agentArn?: string | null;
  /** main | supporting for MTD-IT */
  agentType?: "main" | "supporting" | null;
  knownFactUsed?: string | null;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  /** How the request was raised. */
  channel?: "mtd_api" | "online_agent_authorisation" | "manual";
  notes?: string | null;
  updatedAt: string;
};

export type DeskProfile = {
  aml?: AmlRecord;
  engagement?: EngagementRecord;
  portal?: PortalRecord;
  jobs?: Record<string, JobStatus>;
  /** Per-client onboarding / intake forms with share tokens */
  onboardingForms?: OnboardingFormRecord[];
  /** Formal letters generated for this client */
  clientLetters?: ClientLetterRecord[];
  /**
   * Stable mailbox local-part for inbound documents, e.g. hydratax.uk.hydraretail.
   * Full address: `{documentInboxKey}@{DOCUMENT_INBOUND_DOMAIN}`.
   */
  documentInboxKey?: string;
  /** Bank year-end desk: loans, assets, properties & mortgages. */
  bankLedger?: BankLedger;
  /**
   * Personal Self Assessment taxpayers for this client desk.
   * Limited companies: directors / shareholders. Sole traders: usually one
   * record matching the client.
   */
  saTaxpayers?: SaTaxpayer[];
  /**
   * Portal request id → practice user id who emailed the missing-bank chase.
   * Used to notify that team member when the client uploads.
   */
  saBankChases?: Record<string, string>;
  /**
   * Durable SA100 draft / filed return rows for this desk (survive refresh).
   * Keyed in actions by taxYear + taxpayerId.
   */
  sa100Returns?: Array<{
    id: string;
    clientId: string;
    taxpayerId?: string | null;
    taxYear: string;
    status: "draft" | "submitted" | "accepted";
    draft: Record<string, unknown>;
    calculation?: Record<string, unknown>;
    attachedSupplements?: string[];
    hmrcCorrelationId?: string;
    submittedAt?: string;
    createdAt: string;
    updatedAt: string;
  }>;
  /**
   * After an SA100 draft is deleted, suppress income-desk / accumulate re-seed
   * for that taxpayer+year until the accountant saves a new draft.
   * Keys: `${taxpayerId ?? ""}:${taxYear}`
   */
  sa100BlankStarts?: string[];
  /** Accounts / SA prep pipeline stage for filters and WIP. */
  workStage?: ClientWorkStage;
  /** Timestamped working log (stages, emails, notes). Newest last. */
  workLog?: ClientWorkLogEntry[];
  /** Set when seeded for sales demos (Admin → Load presentation clients). */
  presentationDemo?: string;
  presentationPitch?: string;
  /** Set when rich desk fixtures (people/bank/VAT/CT/emails) have been loaded. */
  presentationRich?: string;
  /** PAYE / payroll desk settings for this employer. */
  payrollSettings?: PayrollDeskSettings;
  /**
   * Agent authorisation per HMRC service (MTD-IT, MTD-VAT, CT, PAYE).
   * MTD services use Agent Authorisation REST; CT/PAYE use Online Agent
   * Authorisation (XML / portal) with local status tracking.
   */
  agentAuthorisations?: Partial<
    Record<AgentAuthServiceKey, AgentAuthorisationRecord>
  >;
};

export type PayslipTemplateId =
  | "hydra_a"
  | "hydra_b"
  | "hydra_c"
  | "hydra_secure";

export type PayrollPayRate = {
  id: string;
  name: string;
  /** Pence per hour, or fixed amount depending on unit. */
  ratePence: number;
  unit: "hour" | "day" | "fixed";
  isDefault?: boolean;
  createdAt: string;
};

export type PayrollDeskSettings = {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  payslipTemplate?: PayslipTemplateId;
  /** PDF (merged) or ZIP of individual payslips for bulk download. */
  bulkDownloadFormat?: "pdf" | "zip";
  /** When false, packs download without ZipCrypto (not recommended). */
  documentPasswordEnabled?: boolean;
  payRates?: PayrollPayRate[];
  /** Tax year label for history filter, e.g. 2025-26 */
  activeTaxYear?: string;
};

export type PracticeLetterhead = {
  practiceName: string;
  addressLines: string[];
  phone?: string;
  email?: string;
  website?: string;
  footerLines: string[];
  /** Optional public logo URL for letters, invoices and packs */
  logoUrl?: string;
  /** e.g. ACCA, ATT, AAT, CTA — shown on letters / invoices */
  qualification?: string;
  /** Practice bank details for client invoices and letters */
  bankName?: string;
  accountName?: string;
  sortCode?: string;
  accountNumber?: string;
  /** Default payment reference hint (e.g. “Quote invoice number”) */
  paymentNote?: string;
  updatedAt?: string;
};

/** Bank block used on invoices when the desk has no per-invoice override. */
export function formatPracticePaymentInstructions(
  lh: PracticeLetterhead,
): string {
  const lines: string[] = [];
  if (lh.bankName) lines.push(`Bank: ${lh.bankName}`);
  if (lh.accountName) lines.push(`Account name: ${lh.accountName}`);
  if (lh.sortCode) lines.push(`Sort code: ${lh.sortCode}`);
  if (lh.accountNumber) lines.push(`Account number: ${lh.accountNumber}`);
  if (lh.paymentNote) lines.push(lh.paymentNote);
  return lines.join("\n");
}

export const DEFAULT_PORTAL_REQUESTS: PortalRequest[] = [
  { id: "bank", label: "Bank statements for the period", done: false },
  { id: "invoices", label: "Sales and purchase invoices", done: false },
  { id: "payroll", label: "Payroll changes and new starter details", done: false },
];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  waiting_client: "Waiting on client",
  in_review: "In review",
  ready: "Ready to file",
  filed: "Filed",
};

export function emptyDeskProfile(): DeskProfile {
  return {};
}

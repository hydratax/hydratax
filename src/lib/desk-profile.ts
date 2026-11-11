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
  /** Accounts / SA prep pipeline stage for filters and WIP. */
  workStage?: ClientWorkStage;
  /** Timestamped working log (stages, emails, notes). Newest last. */
  workLog?: ClientWorkLogEntry[];
  /** Set when seeded for sales demos (Admin → Load presentation clients). */
  presentationDemo?: string;
  presentationPitch?: string;
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

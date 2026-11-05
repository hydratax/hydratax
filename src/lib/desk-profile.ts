import type { OnboardingFormRecord } from "@/lib/onboarding-forms";
import type { LetterTemplateKey } from "@/lib/letter-templates";

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
};

export type PracticeLetterhead = {
  practiceName: string;
  addressLines: string[];
  phone?: string;
  email?: string;
  website?: string;
  footerLines: string[];
  /** Optional public logo URL */
  logoUrl?: string;
  updatedAt?: string;
};

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

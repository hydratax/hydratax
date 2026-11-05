export type AmlRisk = "low" | "medium" | "high";

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
};

export type PortalRecord = {
  token: string;
  requests: PortalRequest[];
  approveAccounts: boolean;
  approveCt600: boolean;
  approveVat: boolean;
  uploads?: PortalUpload[];
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

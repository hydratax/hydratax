/**
 * Companies House confirmation statement (CS01) filing framework.
 * Live submit uses the XML software gateway (presenter account) until
 * confirmation-statement lands on public REST API Filing.
 */

export type CsFilingStatus =
  | "draft"
  | "validated"
  | "queued"
  | "submitting"
  | "submitted"
  | "accepted"
  | "rejected"
  | "failed";

export type CsDirectorVerification = {
  /** As shown on the public register / officer list */
  fullName: string;
  title?: string;
  forename?: string;
  surname?: string;
  /** ISO date YYYY-MM-DD — required by CH verification block */
  dateOfBirth: string;
  /** 11-character Companies House personal code */
  personalCode: string;
  /** Optional when verified name differs from register name */
  nameMismatchReason?: string;
};

export type CsFilingInput = {
  companyNumber: string;
  companyName: string;
  /** Confirmation / made-up-to date */
  confirmationDate: string;
  /** Company authentication code from Companies House */
  companyAuthCode: string;
  registeredEmail?: string;
  lawfulPurposeConfirmed: boolean;
  directors: CsDirectorVerification[];
  /** Optional practice / client linkage */
  clientId?: string;
  practiceId?: string;
};

export type CsFilingRecord = {
  id: string;
  status: CsFilingStatus;
  companyNumber: string;
  companyName: string;
  confirmationDate: string;
  clientId: string | null;
  practiceId: string | null;
  /** Encrypted JSON blob of auth code + personal codes — never returned to admin UI */
  encryptedSecrets: string | null;
  /** Safe director names only (no codes) for UI */
  directorNames: string[];
  lawfulPurposeConfirmed: boolean;
  registeredEmail: string | null;
  chTransactionRef: string | null;
  chSubmissionNumber: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CsFilingPublicView = Omit<CsFilingRecord, "encryptedSecrets"> & {
  secretsPresent: boolean;
  gatewayReady: boolean;
};

export type CsSubmitResult =
  | {
      ok: true;
      filingId: string;
      status: CsFilingStatus;
      mode: "dry_run" | "xml_gateway" | "queued";
      message: string;
      submissionNumber?: string;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type In01FilingStatus =
  | "draft"
  | "validated"
  | "queued"
  | "submitting"
  | "submitted"
  | "accepted"
  | "rejected"
  | "failed";

export type In01FilingRecord = {
  id: string;
  status: In01FilingStatus;
  companyName: string;
  sameDay: boolean;
  registeredEmail: string;
  directorNames: string[];
  sicCodes: string[];
  practiceId: string | null;
  clientId: string | null;
  /** Encrypted JSON of personal codes + full package input */
  encryptedSecrets: string | null;
  chTransactionRef: string | null;
  chSubmissionNumber: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type In01FilingPublicView = Omit<In01FilingRecord, "encryptedSecrets"> & {
  secretsPresent: boolean;
  gatewayReady: boolean;
};

export type In01SubmitResult =
  | {
      ok: true;
      filingId: string;
      status: In01FilingStatus;
      mode: "dry_run" | "xml_gateway" | "queued";
      message: string;
      submissionNumber?: string;
      xmlBytes?: number;
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

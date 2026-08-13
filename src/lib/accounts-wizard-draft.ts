/** Client-side draft for Companies House annual accounts wizard (survives sign-in). */

export const ACCOUNTS_DRAFT_KEY = "hydratax_accounts_wizard_draft";

export type AccountsWizardPhase =
  | "search"
  | "period"
  | "options"
  | "details"
  | "pay";

export type AccountsFilingMode = "ct600" | "accounts" | "both";

export type AccountsWizardDraft = {
  v: 1;
  phase: AccountsWizardPhase;
  companyNumber: string;
  companyName: string;
  status: string | null;
  registeredOffice: string;
  accountsNextDue: string | null;
  lastAccountsMadeUpTo: string | null;
  periodStart: string;
  periodEnd: string;
  filingMode: AccountsFilingMode;
  directors: string[];
  /** Opaque YearEndFilingForm snapshot */
  figuresDraft?: Record<string, unknown> | null;
  updatedAt: string;
};

export function loadAccountsDraft(
  companyNumber?: string | null,
): AccountsWizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACCOUNTS_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as AccountsWizardDraft;
    if (draft?.v !== 1 || !draft.companyNumber) return null;
    if (
      companyNumber &&
      draft.companyNumber.toUpperCase() !== companyNumber.toUpperCase()
    ) {
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function saveAccountsDraft(draft: AccountsWizardDraft) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      ACCOUNTS_DRAFT_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* ignore quota */
  }
}

export function clearAccountsDraft() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACCOUNTS_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

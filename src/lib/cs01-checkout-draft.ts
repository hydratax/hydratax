/** Client-side draft for CS01 public checkout (survives sign-in). */

export const CS01_DRAFT_KEY = "hydratax_cs01_checkout_draft";

export type Cs01CheckoutDraft = {
  v: 1;
  phase: "search" | "confirm";
  companyNumber: string;
  companyName: string;
  confirmationDate: string;
  nextDue: string | null;
  registeredOffice: string;
  sicCodes: string;
  directors: { name: string; role: string | null; appointedOn: string | null }[];
  pscs: { name: string | null; naturesOfControl: string[] }[];
  directorCodes: {
    fullName: string;
    dateOfBirth: string;
    personalCode: string;
  }[];
  companyAuthCode: string;
  confirmed: boolean;
  updatedAt: string;
};

export function loadCs01Draft(
  companyNumber?: string | null,
): Cs01CheckoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CS01_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Cs01CheckoutDraft;
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

export function saveCs01Draft(draft: Cs01CheckoutDraft) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CS01_DRAFT_KEY,
      JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }),
    );
  } catch {
    /* ignore quota */
  }
}

export function clearCs01Draft() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CS01_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function cs01ResumePath(companyNumber: string) {
  return `/companies-house/confirmation-statement?company=${encodeURIComponent(companyNumber.toUpperCase())}&resume=1`;
}

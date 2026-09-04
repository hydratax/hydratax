/**
 * HydraTax software-presenter model (Inform Direct–style).
 *
 * FIXED for the whole website (env — never collected from end users):
 *   - Presenter ID
 *   - Presenter authentication code
 *   - Credit account (fee filings: CS01, IN01, …)
 *   - Presenter email (registered with Companies House for this presenter)
 *   - Optional contact name / phone on FormHeader
 *
 * VARIES per filing (client / company payload):
 *   - Company number, name, company authentication code
 *   - Director / PSC personal codes and related person details
 *   - Form-specific fields (confirmation date, SIC, capital, etc.)
 */

import { getChFilingEnv } from "./config";
import {
  CH_PRESENTER_CREDENTIAL_PATTERN,
  validatePresenterCredentials,
} from "./gateway-auth";

export type ChCompanyJurisdiction = "EW" | "SC" | "NI" | "R";

export type HydraPresenterConfig = {
  env: "live" | "test";
  presenterId: string;
  presenterAuthCode: string;
  creditAccountNumber: string | null;
  /** Email registered with CH for this software presenter account */
  presenterEmail: string | null;
  contactName: string | null;
  contactNumber: string | null;
  agentName: string | null;
};

/** Map company number prefix → FormHeader CompanyType. */
export function resolveChCompanyType(
  companyNumber: string,
): ChCompanyJurisdiction {
  const n = companyNumber.trim().toUpperCase().replace(/\s+/g, "");
  if (n.startsWith("SC")) return "SC";
  if (n.startsWith("NI")) return "NI";
  if (n.startsWith("R") && /^R\d/i.test(n)) return "R";
  return "EW";
}

export function getHydraPresenterConfig(): HydraPresenterConfig {
  const cfg = getChFilingEnv();
  return {
    env: cfg.live ? "live" : "test",
    presenterId: cfg.presenterId ?? "",
    presenterAuthCode: cfg.presenterAuthCode ?? "",
    creditAccountNumber: cfg.creditAccountNumber,
    presenterEmail:
      process.env.COMPANIES_HOUSE_PRESENTER_EMAIL?.trim().toLowerCase() || null,
    contactName:
      process.env.COMPANIES_HOUSE_PRESENTER_CONTACT_NAME?.trim() ||
      process.env.COMPANIES_HOUSE_AGENT_NAME?.trim() ||
      "HydraTax",
    contactNumber:
      process.env.COMPANIES_HOUSE_PRESENTER_CONTACT_NUMBER?.trim() || null,
    agentName:
      process.env.COMPANIES_HOUSE_AGENT_NAME?.trim() ||
      "HYDRA CONSULTANCY SERVICES LTD",
  };
}

export type PresenterReadiness = {
  ok: boolean;
  canAttemptLiveFeeFiling: boolean;
  fixedPresenter: {
    presenterIdConfigured: boolean;
    presenterAuthConfigured: boolean;
    creditAccountConfigured: boolean;
    presenterEmailConfigured: boolean;
    presenterIdFormatOk: boolean;
    presenterAuthFormatOk: boolean;
    looksLikeSoftwarePresenterId: boolean;
    notWebFilingEmail: boolean;
  };
  blockers: string[];
  notes: string[];
};

/** Validates the fixed website presenter account — not per-company inputs. */
export function describePresenterReadiness(): PresenterReadiness {
  const p = getHydraPresenterConfig();
  const credCheck = validatePresenterCredentials();
  const blockers: string[] = [];
  const notes: string[] = [
    "HydraTax files as one software presenter for all clients (Inform Direct model).",
    "Clients supply company number, company auth code, and personal codes only.",
    "Presenter email is registered with Companies House for this presenter — not sent as a separate login.",
  ];

  const presenterIdFormatOk = CH_PRESENTER_CREDENTIAL_PATTERN.test(
    p.presenterId,
  );
  const presenterAuthFormatOk = CH_PRESENTER_CREDENTIAL_PATTERN.test(
    p.presenterAuthCode,
  );
  const looksLikeSoftwarePresenterId =
    /^000[A-Z0-9]{5}000$/i.test(p.presenterId) ||
    /^E\d{10}$/i.test(p.presenterId);
  const notWebFilingEmail =
    !p.presenterId.includes("@") && !p.presenterAuthCode.includes("@");

  if (!credCheck.ok) blockers.push(credCheck.error);
  if (p.env === "live" && !p.creditAccountNumber) {
    blockers.push(
      "COMPANIES_HOUSE_CREDIT_ACCOUNT is required for live fee filings (CS01 / IN01).",
    );
  }
  if (!p.presenterEmail) {
    notes.push(
      "Set COMPANIES_HOUSE_PRESENTER_EMAIL to the email registered with CH for this presenter (ops reference).",
    );
  }

  const canAttemptLiveFeeFiling =
    credCheck.ok &&
    Boolean(p.creditAccountNumber) &&
    p.env === "live";

  return {
    ok: blockers.length === 0 && credCheck.ok,
    canAttemptLiveFeeFiling,
    fixedPresenter: {
      presenterIdConfigured: Boolean(p.presenterId),
      presenterAuthConfigured: Boolean(p.presenterAuthCode),
      creditAccountConfigured: Boolean(p.creditAccountNumber),
      presenterEmailConfigured: Boolean(p.presenterEmail),
      presenterIdFormatOk,
      presenterAuthFormatOk,
      looksLikeSoftwarePresenterId,
      notWebFilingEmail,
    },
    blockers,
    notes,
  };
}

/** Per-company fields required on every secretarial submission. */
export type ChCompanyFilingIdentity = {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  companyType?: ChCompanyJurisdiction;
};

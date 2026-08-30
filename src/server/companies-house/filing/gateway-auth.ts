import { createHash, randomBytes } from "crypto";
import { getChFilingEnv } from "./config";

/** Incrementing numeric transaction id for CHMD5 (output gateway). */
let softwareFilingTxn = Date.now();

export function nextSoftwareFilingTransactionId() {
  softwareFilingTxn += 1;
  return String(softwareFilingTxn);
}

/**
 * PackageReference in FormHeader identifies the software package to CH.
 * Test submissions use 0012; live credit-account presenters typically use
 * their presenter ID (issued with the presenter account).
 */
export function resolveChPackageReference() {
  const cfg = getChFilingEnv();
  if (cfg.packageReference) return cfg.packageReference;
  if (cfg.live && cfg.presenterId) return cfg.presenterId;
  return "0012";
}

/**
 * Software filing (CS01, IN01, etc.) uses Method clear with plain presenter
 * credentials — not CHMD5 (that is for the output/search gateway).
 */
export function buildPresenterAuthenticationXml() {
  const cfg = getChFilingEnv();
  const presenterId = cfg.presenterId ?? "";
  const presenterAuth = cfg.presenterAuthCode ?? "";
  return `<IDAuthentication>
        <SenderID>${xmlEscape(presenterId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${xmlEscape(presenterAuth)}</Value>
        </Authentication>
      </IDAuthentication>`;
}

/** CHMD5 for output gateway: MD5(senderId + password + transactionId) */
export function buildChmd5AuthenticationXml(transactionId: string) {
  const cfg = getChFilingEnv();
  const presenterId = cfg.presenterId ?? "";
  const presenterAuth = cfg.presenterAuthCode ?? "";
  const digest = createHash("md5")
    .update(`${presenterId}${presenterAuth}${transactionId}`)
    .digest("hex");
  return `<IDAuthentication>
        <SenderID>${xmlEscape(presenterId)}</SenderID>
        <Authentication>
          <Method>CHMD5</Method>
          <Value>${digest}</Value>
        </Authentication>
      </IDAuthentication>`;
}

export function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function sixCharSubmissionNumber() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export function describeChCredentialsForFiling() {
  const cfg = getChFilingEnv();
  return {
    presenterConfigured: Boolean(cfg.presenterId && cfg.presenterAuthCode),
    creditAccountConfigured: Boolean(cfg.creditAccountNumber),
    canFileFeeBearing:
      Boolean(cfg.presenterId && cfg.presenterAuthCode) &&
      Boolean(cfg.creditAccountNumber),
    packageReference: resolveChPackageReference(),
  };
}

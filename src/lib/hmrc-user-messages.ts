/**
 * Plain-English HMRC messages for the accountant desk.
 * Never surface OAuth / HTTP / JSON jargon.
 */

const RESULT_MESSAGES: Record<string, string> = {
  connected: "Connected to HMRC for this client.",
  connect_failed:
    "Could not finish connecting to HMRC. Check the VAT number and try again.",
  demo_connect_available:
    "HMRC connection is not set up on this system yet. Ask your software provider to finish the HMRC app setup.",
  app_not_configured:
    "HMRC connection is not set up on this system yet. Ask your software provider to finish the HMRC app setup.",
  app_credentials_invalid:
    "HMRC did not accept this software’s login details. Ask your software provider to check the live HMRC app credentials.",
  access_denied:
    "HMRC authorisation was cancelled. The client (or agent) must approve the connection before you can file.",
  user_declined:
    "HMRC authorisation was cancelled. The client (or agent) must approve the connection before you can file.",
  not_authorised:
    "This firm is not authorised by the client for VAT with HMRC. Ask the client to authorise you, then try again.",
  not_authorised_by_client:
    "This firm is not authorised by the client for VAT with HMRC. Ask the client to authorise you, then try again.",
  invalid_vrn:
    "That VAT number does not look right. Check the 9-digit VAT number and try again.",
  vrn_mismatch:
    "The VAT number does not match the HMRC account that was authorised. Check the number and reconnect.",
  period_invalid:
    "HMRC did not accept this VAT period. Check the dates match an open obligation, then try again.",
  already_submitted:
    "HMRC already has a return for this period. You cannot submit it again.",
  duplicate_submission:
    "HMRC already has a return for this period. You cannot submit it again.",
  not_connected:
    "This client is not connected to HMRC yet. Connect first, then submit.",
  rule_failed:
    "HMRC rejected the return. Check the nine boxes and period dates, then try again.",
};

/** Fixed `?hmrc=` result codes → desk copy. */
export function messageForHmrcResult(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = code.trim().toLowerCase();
  if (!key) return null;
  if (RESULT_MESSAGES[key]) return RESULT_MESSAGES[key];
  return "Something went wrong with HMRC. Please try again.";
}

export function isHmrcSuccessResult(code: string | null | undefined): boolean {
  return (code ?? "").trim().toLowerCase() === "connected";
}

/**
 * Map raw HMRC / server failure text into desk copy.
 * Prefer known codes; never echo technical payloads.
 */
export function humanizeHmrcFailure(
  raw: string | null | undefined,
  fallback = "HMRC could not complete this step. Please try again.",
): string {
  const text = (raw ?? "").trim();
  if (!text) return fallback;
  const lower = text.toLowerCase();

  if (
    /client_id is invalid|invalid_client|unauthorized_client|client id is invalid/i.test(
      text,
    )
  ) {
    return RESULT_MESSAGES.app_credentials_invalid;
  }
  if (/access_denied|user denied|consent/i.test(text)) {
    return RESULT_MESSAGES.access_denied;
  }
  if (
    /client_or_agent_not_authorised|not_authorised|not authorized|agent.*not.*author/i.test(
      lower,
    )
  ) {
    return RESULT_MESSAGES.not_authorised_by_client;
  }
  if (
    /invalid.*vrn|vrn.*invalid|vat number|no vrn|missing vrn/i.test(lower)
  ) {
    return RESULT_MESSAGES.invalid_vrn;
  }
  if (/already.*submit|duplicate|period.*fulfilled|return.*exists/i.test(lower)) {
    return RESULT_MESSAGES.already_submitted;
  }
  if (/not connected|oauth|complete oauth|no access token/i.test(lower)) {
    return RESULT_MESSAGES.not_connected;
  }
  if (/period|obligation|periodkey/i.test(lower) && /invalid|not found|closed/i.test(lower)) {
    return RESULT_MESSAGES.period_invalid;
  }
  if (/hmrc rejected|rule|business.?error|http 4\d\d/i.test(lower)) {
    return RESULT_MESSAGES.rule_failed;
  }
  if (/hmrc_client_id is not configured|not configured/i.test(lower)) {
    return RESULT_MESSAGES.app_not_configured;
  }

  // Never show JSON / stack / HTTP dumps on the desk.
  if (
    /[{[]/.test(text) ||
    /http\s*\d{3}/i.test(text) ||
    /exception|stack|digest|minified/i.test(text)
  ) {
    return fallback;
  }

  // Short plain sentences from our own code are fine.
  if (text.length <= 160 && !/[<>]/.test(text)) return text;
  return fallback;
}

/** OAuth `error` query value from HMRC → fixed desk code. */
export function hmrcOauthErrorToResult(error: string): string {
  const e = error.trim().toLowerCase();
  if (e === "access_denied") return "access_denied";
  if (e === "unauthorized_client" || e === "invalid_client") {
    return "app_credentials_invalid";
  }
  if (e === "invalid_scope" || e === "unsupported_response_type") {
    return "app_not_configured";
  }
  return "connect_failed";
}

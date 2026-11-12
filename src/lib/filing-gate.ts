/** Shared codes for trial / payment gates on live HMRC & Companies House filings. */

export const FILING_GATE = {
  TRIAL_BLOCKED: "TRIAL_SUBMIT_BLOCKED",
  PAYMENT_FAILED: "TRIAL_PAYMENT_FAILED",
  PAYMENT_REQUIRED: "PAYMENT_METHOD_REQUIRED",
} as const;

export type FilingGateCode = (typeof FILING_GATE)[keyof typeof FILING_GATE];

export function isFilingGateMessage(message: string): boolean {
  return (
    message.includes(FILING_GATE.TRIAL_BLOCKED) ||
    message.includes(FILING_GATE.PAYMENT_FAILED) ||
    message.includes(FILING_GATE.PAYMENT_METHOD_REQUIRED)
  );
}

export function filingGateUserMessage(code: FilingGateCode): string {
  switch (code) {
    case FILING_GATE.TRIAL_BLOCKED:
      return `${FILING_GATE.TRIAL_BLOCKED}: Your free trial lets you prepare returns, but live submission to HMRC or Companies House ends the trial and charges your card for the plan you chose. Confirm to continue, or cancel within 7 days from Settings → Subscription.`;
    case FILING_GATE.PAYMENT_FAILED:
      return `${FILING_GATE.PAYMENT_FAILED}: We could not charge the card on file. Update your payment method in Settings → Subscription (Manage billing), then try the submission again.`;
    case FILING_GATE.PAYMENT_METHOD_REQUIRED:
      return `${FILING_GATE.PAYMENT_METHOD_REQUIRED}: Add or update a payment card in Settings → Subscription before submitting live returns.`;
    default:
      return "Submission is not available until billing is active.";
  }
}

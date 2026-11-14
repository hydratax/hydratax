/**
 * Best-effort security-event logging for rejected inbound webhooks / cron
 * calls. Never throws, never logs headers, bodies, signatures or secrets —
 * only the provider name, a fixed reason code and a hashed IP (when
 * SECURITY_EVENT_SALT is configured). Throttled per provider + IP so an
 * unauthenticated attacker cannot flood `security_events` through us.
 */

import { clientIpFromHeaders } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/server/privacy/security-events";

export type WebhookProvider =
  | "stripe"
  | "whatsapp"
  | "resend"
  | "email"
  | "cron";

export type WebhookRejectionReason =
  | "missing_signature"
  | "invalid_signature"
  | "unauthorised"
  | "not_configured"
  | "verify_token_mismatch";

export async function logWebhookRejection(
  req: { headers: { get(name: string): string | null } },
  provider: WebhookProvider,
  reason: WebhookRejectionReason,
): Promise<void> {
  try {
    const ip = clientIpFromHeaders(req.headers);
    await logSecurityEvent({
      type:
        reason === "unauthorised" || reason === "not_configured"
          ? "webhook.unauthorised"
          : "webhook.signature_failed",
      severity: reason === "not_configured" ? "low" : "medium",
      ip,
      throttleKey: `${provider}:${ip}`,
      details: { provider, reason },
    });
  } catch {
    /* logging must never break the webhook response */
  }
}

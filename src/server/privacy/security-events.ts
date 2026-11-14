/**
 * Security-event logger (UK GDPR Art 32 / Art 33(5) breach readiness).
 *
 * Writes to the append-only `public.security_events` table through the
 * service-role client (RLS deny-by-default; no policies for anon /
 * authenticated). NEVER throws — logging must not break the caller.
 *
 * Intended callers (wire these in the files their owners control):
 *   - auth: repeated failed sign-ins, MFA failures, session-policy kicks,
 *     password-reset bursts            → `auth.anomaly`
 *   - privacy actions in this repo     → `privacy.*`
 *   - webhook signature failures       → `webhook.signature_failed`
 *   - suspected breach triage          → `breach.suspected`
 *
 * Never put secrets, tokens, NINO/UTR or message bodies in `details`.
 */

import { createHmac } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";
import { privacyAdminClient } from "@/server/privacy/db";
import { stripSecrets } from "@/server/privacy/export-shape";

export type SecurityEventType =
  | "auth.anomaly"
  | "auth.login_failed_burst"
  | "auth.mfa_failed_burst"
  | "auth.session_rejected"
  | "auth.mfa_failed"
  | "auth.mfa_locked"
  | "auth.hmrc_oauth_rejected"
  | "auth.api_denied"
  | "auth.admin_denied"
  | "webhook.signature_failed"
  | "webhook.unauthorised"
  | "privacy.data_export"
  | "privacy.account_erasure_requested"
  | "privacy.account_erasure_cancelled"
  | "privacy.account_erased"
  | "privacy.client_exported"
  | "privacy.client_erased"
  | "privacy.retention_run"
  | "breach.suspected"
  | "breach.confirmed";

export type SecuritySeverity = "info" | "low" | "medium" | "high" | "critical";

export type SecurityEventInput = {
  type: SecurityEventType;
  severity?: SecuritySeverity;
  /** Who did it (verified session user), if any. */
  actorUserId?: string | null;
  /** Whose data it concerns, if different. */
  subjectUserId?: string | null;
  practiceId?: string | null;
  /** Raw client IP — hashed with SECURITY_EVENT_SALT before storage. */
  ip?: string | null;
  details?: Record<string, unknown>;
  /**
   * Flood guard for UNAUTHENTICATED triggers (bad webhook signatures, API
   * denials): at most THROTTLE_MAX events per key per THROTTLE_WINDOW_MS per
   * server instance, so an attacker cannot fill the table through us. Use a
   * coarse key such as the route name + hashed IP; never raw PII.
   */
  throttleKey?: string;
};

const THROTTLE_MAX = 5;
const THROTTLE_WINDOW_MS = 10 * 60 * 1000;
const MAX_DETAILS_BYTES = 4096;

/** Pseudonymise an IP. Returns null when no salt is configured (we then store nothing). */
export function hashIp(ip: string | null | undefined): string | null {
  const salt = process.env.SECURITY_EVENT_SALT?.trim();
  if (!ip || !salt) return null;
  return createHmac("sha256", salt).update(ip.trim()).digest("hex").slice(0, 32);
}

export function sanitiseDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!details) return {};
  const cleaned = stripSecrets(details);
  const json = JSON.stringify(cleaned);
  if (json.length <= MAX_DETAILS_BYTES) return cleaned;
  return { truncated: true, preview: json.slice(0, 512) };
}

export function buildSecurityEventRow(input: SecurityEventInput) {
  return {
    event_type: input.type,
    severity: input.severity ?? "info",
    actor_user_id: input.actorUserId ?? null,
    subject_user_id: input.subjectUserId ?? null,
    practice_id: input.practiceId ?? null,
    ip_hash: hashIp(input.ip),
    details: sanitiseDetails(input.details),
  };
}

export async function logSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    if (input.throttleKey) {
      const t = rateLimit({
        key: `secevt:${input.type}:${input.throttleKey}`,
        limit: THROTTLE_MAX,
        windowMs: THROTTLE_WINDOW_MS,
      });
      if (!t.ok) return;
    }
    const admin = privacyAdminClient();
    if (!admin) return;
    const { error } = await admin
      .from("security_events")
      .insert(buildSecurityEventRow(input));
    if (error) {
      console.warn("[security-events] insert failed:", error.message);
    }
  } catch (err) {
    console.warn(
      "[security-events] insert error:",
      err instanceof Error ? err.message : "unknown",
    );
  }
}

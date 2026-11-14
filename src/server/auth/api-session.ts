import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  getOptionalSession,
  type SessionContext,
} from "@/server/auth/session";

/**
 * Session gate for Route Handlers (/api/*).
 *
 * `requireSession()` redirects, which is wrong for fetch()/download endpoints,
 * and `getOptionalSession()` alone skips two checks the desk pages enforce:
 *   1. desk session wall-clock expiry (10h untrusted / 7d trusted device)
 *   2. MFA step-up (password done, OTP not yet verified)
 * This helper applies both and answers with JSON 401/403 instead of redirecting.
 * /api/* is NOT covered by the proxy's auth redirect, so every protected route
 * handler must call this.
 */
export type ApiSessionResult =
  | { ok: true; session: SessionContext }
  | {
      ok: false;
      status: 401 | 403;
      code: "unauthenticated" | "session_expired" | "mfa_required";
      error: string;
    };

export async function getApiSession(): Promise<ApiSessionResult> {
  // Desk expiry (cookie-based wall clock; the proxy skips /api/*).
  try {
    const { deskSessionExpired } = await import("@/server/auth/session-policy");
    if (await deskSessionExpired()) {
      return {
        ok: false,
        status: 401,
        code: "session_expired",
        error: "Your session has expired. Sign in again.",
      };
    }
  } catch {
    /* cookies unavailable — fall through to the session check */
  }

  const session = await getOptionalSession();
  if (!session) {
    return {
      ok: false,
      status: 401,
      code: "unauthenticated",
      error: "Sign in required.",
    };
  }

  if (isSupabaseConfigured() && !session.local) {
    let needsStepUp = true; // fail closed
    try {
      const { userNeedsMfaStepUp } = await import("@/server/auth/mfa-core");
      needsStepUp = await userNeedsMfaStepUp(session.userId);
    } catch {
      needsStepUp = true;
    }
    if (needsStepUp) {
      return {
        ok: false,
        status: 403,
        code: "mfa_required",
        error: "Two-factor verification required.",
      };
    }
  }

  return { ok: true, session };
}

export function apiSessionErrorResponse(
  result: Extract<ApiSessionResult, { ok: false }>,
): NextResponse {
  return NextResponse.json(
    { error: result.error, code: result.code },
    { status: result.status, headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * Usage:
 *   const auth = await requireApiSession();
 *   if (!auth.ok) return auth.response;
 *   const { session } = auth;
 */
export async function requireApiSession(): Promise<
  { ok: true; session: SessionContext } | { ok: false; response: NextResponse }
> {
  const result = await getApiSession();
  if (result.ok) return result;
  await logApiDenial(result);
  return { ok: false, response: apiSessionErrorResponse(result) };
}

/**
 * Best-effort, non-throwing record of an /api/* session denial. Fixed reason
 * code + hashed IP only. Throttled per reason + IP: unauthenticated callers can
 * trigger this at will, so it must not become a write amplifier.
 */
async function logApiDenial(
  result: Extract<ApiSessionResult, { ok: false }>,
): Promise<void> {
  try {
    const [{ getClientIp }, { logSecurityEvent }] = await Promise.all([
      import("@/lib/rate-limit"),
      import("@/server/privacy/security-events"),
    ]);
    const ip = await getClientIp();
    await logSecurityEvent({
      type: "auth.api_denied",
      severity: result.code === "mfa_required" ? "medium" : "info",
      ip,
      throttleKey: `${result.code}:${ip}`,
      details: { reason: result.code, status: result.status },
    });
  } catch {
    /* logging must never change the response */
  }
}

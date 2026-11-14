import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/server/hmrc/oauth";
import { saveHmrcConnection } from "@/server/hmrc/tokens";
import { appendAuditEvent } from "@/server/audit/log";
import { getApiSession } from "@/server/auth/api-session";
import { clientBelongsToPractice } from "@/server/hmrc/client-ownership";
import {
  HMRC_STATE_COOKIE,
  hmrcReturnPath,
  verifyHmrcState,
} from "@/server/hmrc/oauth-state";
import { resolveAuthOrigin } from "@/lib/auth-origin";
import { isProductionRuntime } from "@/lib/env";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/server/privacy/security-events";

function clearStateCookie(res: NextResponse) {
  res.cookies.set(HMRC_STATE_COOKIE, "", {
    httpOnly: true,
    secure: isProductionRuntime() || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/hmrc",
    maxAge: 0,
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

/** Best-effort, non-throwing audit of a rejected callback (fixed reason code only). */
async function logRejection(
  req: NextRequest,
  reason: string,
  session?: { userId: string; practiceId: string },
) {
  const ip = clientIpFromHeaders(req.headers);
  await logSecurityEvent({
    type: "auth.hmrc_oauth_rejected",
    severity:
      reason === "bad_state" || reason === "client_not_in_practice"
        ? "medium"
        : "low",
    actorUserId: session?.userId ?? null,
    practiceId: session?.practiceId ?? null,
    ip,
    throttleKey: `hmrc-callback:${session?.userId ?? ip}:${reason}`,
    details: { reason },
  });
}

export async function GET(req: NextRequest) {
  const origin = resolveAuthOrigin(req);
  const redirectTo = (path: string) =>
    clearStateCookie(NextResponse.redirect(new URL(path, origin)));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  // The user comes back from HMRC with their own session cookie (top-level GET,
  // SameSite=Lax). No session => no connection, ever.
  const auth = await getApiSession();
  if (!auth.ok) {
    if (auth.code === "mfa_required") {
      return redirectTo("/verify-2fa?next=%2Fsettings%2Fhmrc");
    }
    return redirectTo("/sign-in?next=%2Fsettings%2Fhmrc");
  }
  const { session } = auth;

  if (error) {
    // Fixed vocabulary only — never reflect arbitrary provider text.
    const safe = /^[a-z_]{1,40}$/.test(error) ? error : "hmrc_error";
    return redirectTo(`/settings/hmrc?error=${encodeURIComponent(safe)}`);
  }

  if (!code || !state) {
    await logRejection(req, "missing_code_or_state", session);
    return clearStateCookie(
      NextResponse.json({ error: "Missing code/state" }, { status: 400 }),
    );
  }

  const payload = verifyHmrcState(
    state,
    req.cookies.get(HMRC_STATE_COOKIE)?.value,
    session.userId,
  );
  if (!payload) {
    await logRejection(req, "bad_state", session);
    return clearStateCookie(
      NextResponse.json({ error: "Invalid or expired state" }, { status: 400 }),
    );
  }

  if (session.role === "readonly") {
    await logRejection(req, "readonly_role", session);
    return clearStateCookie(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
  }

  // Re-verify practice ownership at callback time (client could have moved).
  if (!(await clientBelongsToPractice(payload.clientId, session.practiceId))) {
    await logRejection(req, "client_not_in_practice", session);
    return clearStateCookie(
      NextResponse.json({ error: "Client not found" }, { status: 404 }),
    );
  }

  let tokens;
  try {
    tokens = await exchangeAuthorizationCode(code);
    await saveHmrcConnection(payload.clientId, tokens, session.practiceId);
  } catch (err) {
    console.error(
      "[hmrc/callback] connect failed",
      err instanceof Error ? err.message : "unknown",
    );
    return redirectTo(
      hmrcReturnPath(payload.clientId, payload.returnTo, "connect_failed"),
    );
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    actorId: session.userId,
    clientId: payload.clientId,
    action: "hmrc.connect",
    entityType: "hmrc_connection",
    entityId: payload.clientId,
    detail: { scopes: tokens.scopes },
  });

  return redirectTo(
    hmrcReturnPath(payload.clientId, payload.returnTo, "connected"),
  );
}

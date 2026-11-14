import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/server/hmrc/oauth";
import { getHmrcConfig } from "@/server/hmrc/config";
import { getApiSession } from "@/server/auth/api-session";
import { clientBelongsToPractice } from "@/server/hmrc/client-ownership";
import {
  HMRC_STATE_COOKIE,
  HMRC_STATE_TTL_SECONDS,
  createHmrcState,
  hmrcReturnPath,
  isHmrcClientUuid,
  parseHmrcReturnTo,
} from "@/server/hmrc/oauth-state";
import { resolveAuthOrigin } from "@/lib/auth-origin";
import { isProductionRuntime } from "@/lib/env";

export async function GET(req: NextRequest) {
  const origin = resolveAuthOrigin(req);
  const clientId = req.nextUrl.searchParams.get("clientId");
  const returnTo = parseHmrcReturnTo(req.nextUrl.searchParams.get("returnTo"));

  if (!isHmrcClientUuid(clientId)) {
    return NextResponse.json({ error: "Valid clientId required" }, { status: 400 });
  }

  // Must be a signed-in, MFA-verified user — browser navigation, so redirect
  // (not JSON) when they need to sign in / verify.
  const auth = await getApiSession();
  if (!auth.ok) {
    const here = `/api/hmrc/authorize?clientId=${clientId}&returnTo=${returnTo}`;
    const dest =
      auth.code === "mfa_required"
        ? `/verify-2fa?next=${encodeURIComponent(here)}`
        : `/sign-in?next=${encodeURIComponent(here)}`;
    return NextResponse.redirect(new URL(dest, origin));
  }
  const { session } = auth;
  if (session.role === "readonly") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Practice-scoped: the client must belong to the caller's practice.
  if (!(await clientBelongsToPractice(clientId, session.practiceId))) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const cfg = getHmrcConfig();
  if (!cfg.clientId) {
    return NextResponse.redirect(
      new URL(
        hmrcReturnPath(clientId, returnTo, "demo_connect_available"),
        origin,
      ),
    );
  }

  let state: string;
  let cookieValue: string;
  try {
    ({ state, cookieValue } = createHmrcState({
      clientId,
      returnTo,
      userId: session.userId,
    }));
  } catch (err) {
    console.error("[hmrc/authorize] state creation failed", err);
    return NextResponse.json(
      { error: "HMRC connection is not available right now." },
      { status: 503 },
    );
  }

  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set(HMRC_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: isProductionRuntime() || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/hmrc",
    maxAge: HMRC_STATE_TTL_SECONDS,
  });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

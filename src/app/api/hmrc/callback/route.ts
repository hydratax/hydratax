import { NextRequest, NextResponse } from "next/server";
import { exchangeAuthorizationCode } from "@/server/hmrc/oauth";
import { saveHmrcConnection } from "@/server/hmrc/tokens";
import { appendAuditEvent } from "@/server/audit/log";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/hmrc?error=${encodeURIComponent(error)}`, req.url),
    );
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code/state" }, { status: 400 });
  }

  let clientId: string;
  let returnTo: string | undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { clientId: string; returnTo?: string };
    clientId = parsed.clientId;
    returnTo = parsed.returnTo;
  } catch {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const tokens = await exchangeAuthorizationCode(code);
  await saveHmrcConnection(clientId, tokens);
  await appendAuditEvent({
    actorId: "hmrc-oauth-callback",
    clientId,
    action: "hmrc.connect",
    entityType: "hmrc_connection",
    entityId: clientId,
    detail: { scopes: tokens.scopes },
  });

  const dest =
    returnTo === "vat"
      ? `/clients/${clientId}/vat?hmrc=connected`
      : `/clients/${clientId}?hmrc=connected`;

  return NextResponse.redirect(new URL(dest, req.url));
}

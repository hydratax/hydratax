import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/api-session";
import {
  isMailboxOAuthProvider,
  mailboxOAuthAuthorizeUrl,
  mailboxOAuthEnv,
} from "@/lib/email/mailbox-oauth";

/**
 * Start Gmail / Microsoft mailbox OAuth for outbound client mail.
 * Requires GOOGLE_MAIL_* or MICROSOFT_MAIL_* env; otherwise redirects with a
 * clear setup message (middle branded send remains the default).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { provider: raw } = await context.params;
  if (!isMailboxOAuthProvider(raw)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  ).replace(/\/$/, "");
  const env = mailboxOAuthEnv(raw);

  if (!env.configured || !env.clientId) {
    const q = new URLSearchParams({
      mailbox: "setup",
      provider: raw,
      missing: env.missing.join(","),
    });
    return NextResponse.redirect(`${appUrl}/settings/channels?${q}`);
  }

  const redirectUri = `${appUrl}/api/oauth/mailbox/${raw}/callback`;
  const statePayload = Buffer.from(
    JSON.stringify({
      practiceId: auth.session.practiceId,
      userId: auth.session.userId,
      provider: raw,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
    }),
    "utf8",
  ).toString("base64url");

  const url = mailboxOAuthAuthorizeUrl(raw, {
    clientId: env.clientId,
    redirectUri,
    state: statePayload,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(`mailbox_oauth_${raw}`, statePayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}

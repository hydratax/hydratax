import { NextResponse } from "next/server";
import { requireApiSession } from "@/server/auth/api-session";
import {
  isMailboxOAuthProvider,
  mailboxOAuthEnv,
} from "@/lib/email/mailbox-oauth";
import {
  connectPracticeChannel,
  disconnectPracticeChannel,
} from "@/server/actions/correspondence";

/**
 * OAuth callback scaffold. Exchanges the code for tokens when env is set;
 * stores the mailbox connection. Full Gmail/Graph send uses stored tokens later.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { provider: raw } = await context.params;
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  ).replace(/\/$/, "");

  if (!isMailboxOAuthProvider(raw)) {
    return NextResponse.redirect(
      `${appUrl}/settings/channels?mailbox=error&reason=provider`,
    );
  }

  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  if (err) {
    return NextResponse.redirect(
      `${appUrl}/settings/channels?mailbox=denied&provider=${raw}`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`mailbox_oauth_${raw}=`))
    ?.slice(`mailbox_oauth_${raw}=`.length);

  if (!code || !state || !cookie || cookie !== state) {
    return NextResponse.redirect(
      `${appUrl}/settings/channels?mailbox=error&reason=state`,
    );
  }

  let statePracticeId: string | null = null;
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { practiceId?: string; provider?: string };
    statePracticeId = parsed.practiceId ?? null;
    if (parsed.provider !== raw) throw new Error("provider mismatch");
  } catch {
    return NextResponse.redirect(
      `${appUrl}/settings/channels?mailbox=error&reason=state`,
    );
  }

  if (statePracticeId !== auth.session.practiceId) {
    return NextResponse.redirect(
      `${appUrl}/settings/channels?mailbox=error&reason=practice`,
    );
  }

  const env = mailboxOAuthEnv(raw);
  if (!env.configured || !env.clientId || !env.clientSecret) {
    return NextResponse.redirect(
      `${appUrl}/settings/channels?mailbox=setup&provider=${raw}`,
    );
  }

  const redirectUri = `${appUrl}/api/oauth/mailbox/${raw}/callback`;
  const tokenUrl =
    raw === "gmail"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    const detail = (await tokenRes.text()).slice(0, 200);
    console.error("[mailbox-oauth] token exchange failed", raw, detail);
    return NextResponse.redirect(
      `${appUrl}/settings/channels?mailbox=error&reason=token`,
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };

  let emailAddress =
    auth.session.email?.trim().toLowerCase() || "mailbox@unknown";
  let displayName = auth.session.practiceName || raw;

  // Prefer email from id_token / userinfo when present.
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(tokens.id_token.split(".")[1]!, "base64url").toString(
          "utf8",
        ),
      ) as { email?: string; preferred_username?: string; name?: string };
      emailAddress = (
        payload.email ||
        payload.preferred_username ||
        emailAddress
      ).toLowerCase();
      if (payload.name) displayName = payload.name;
    } catch {
      /* ignore */
    }
  } else if (raw === "gmail" && tokens.access_token) {
    try {
      const me = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      );
      if (me.ok) {
        const info = (await me.json()) as { email?: string; name?: string };
        if (info.email) emailAddress = info.email.toLowerCase();
        if (info.name) displayName = info.name;
      }
    } catch {
      /* ignore */
    }
  }

  const credentialBlob = JSON.stringify({
    refresh_token: tokens.refresh_token ?? null,
    access_token: tokens.access_token ?? null,
    expires_at: tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : null,
    provider: raw,
  });

  // One outbound mailbox only — connecting this provider drops the other.
  const other = raw === "gmail" ? "outlook" : "gmail";
  try {
    await disconnectPracticeChannel(other);
  } catch {
    /* ignore if none connected */
  }

  await connectPracticeChannel({
    channel: raw,
    displayName,
    externalAccountId: emailAddress,
    apiToken: credentialBlob,
    oauthReady: Boolean(tokens.refresh_token || tokens.access_token),
  });

  const res = NextResponse.redirect(
    `${appUrl}/settings/channels?mailbox=connected&provider=${raw}`,
  );
  res.cookies.set(`mailbox_oauth_${raw}`, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}

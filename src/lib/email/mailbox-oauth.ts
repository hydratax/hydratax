/**
 * Framework for connecting a practice mailbox (Gmail / Microsoft 365)
 * so outbound client mail can send as the firm. Until connected, HydraTax
 * uses the branded middle path (practice name + Reply-To).
 */

export type MailboxOAuthProvider = "gmail" | "outlook";

export type MailboxSendMode = "hydra_branded" | "connected_mailbox";

export const MAILBOX_OAUTH_PROVIDERS: MailboxOAuthProvider[] = [
  "gmail",
  "outlook",
];

export const MAILBOX_OAUTH_SCOPES: Record<MailboxOAuthProvider, string[]> = {
  gmail: [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send",
  ],
  outlook: [
    "openid",
    "email",
    "profile",
    "offline_access",
    "https://graph.microsoft.com/Mail.Send",
  ],
};

export function mailboxOAuthEnv(provider: MailboxOAuthProvider): {
  configured: boolean;
  clientId: string | null;
  clientSecret: string | null;
  missing: string[];
} {
  if (provider === "gmail") {
    const clientId = process.env.GOOGLE_MAIL_CLIENT_ID?.trim() || null;
    const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET?.trim() || null;
    const missing: string[] = [];
    if (!clientId) missing.push("GOOGLE_MAIL_CLIENT_ID");
    if (!clientSecret) missing.push("GOOGLE_MAIL_CLIENT_SECRET");
    return {
      configured: Boolean(clientId && clientSecret),
      clientId,
      clientSecret,
      missing,
    };
  }
  const clientId = process.env.MICROSOFT_MAIL_CLIENT_ID?.trim() || null;
  const clientSecret = process.env.MICROSOFT_MAIL_CLIENT_SECRET?.trim() || null;
  const missing: string[] = [];
  if (!clientId) missing.push("MICROSOFT_MAIL_CLIENT_ID");
  if (!clientSecret) missing.push("MICROSOFT_MAIL_CLIENT_SECRET");
  return {
    configured: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    missing,
  };
}

export function mailboxOAuthAuthorizeUrl(
  provider: MailboxOAuthProvider,
  input: { clientId: string; redirectUri: string; state: string },
): string {
  const scopes = MAILBOX_OAUTH_SCOPES[provider].join(" ");
  if (provider === "gmail") {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", input.clientId);
    u.searchParams.set("redirect_uri", input.redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", scopes);
    u.searchParams.set("access_type", "offline");
    u.searchParams.set("prompt", "consent");
    u.searchParams.set("state", input.state);
    return u.toString();
  }
  const u = new URL(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  );
  u.searchParams.set("client_id", input.clientId);
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("response_mode", "query");
  u.searchParams.set("scope", scopes);
  u.searchParams.set("state", input.state);
  return u.toString();
}

export function isMailboxOAuthProvider(
  value: string,
): value is MailboxOAuthProvider {
  return value === "gmail" || value === "outlook";
}

/** Channel keys stored on practice_channel_connections for OAuth mailboxes. */
export function mailboxChannelKey(
  provider: MailboxOAuthProvider,
): "gmail" | "outlook" {
  return provider;
}

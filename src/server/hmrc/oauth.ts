import { getHmrcConfig, HMRC_SCOPES } from "./config";
import { encryptSecret, decryptSecret } from "./crypto";

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
};

export function buildAuthorizeUrl(state: string, scopes = HMRC_SCOPES.combined): string {
  const cfg = getHmrcConfig();
  if (!cfg.clientId) {
    throw new Error("HMRC_CLIENT_ID is not configured");
  }
  const url = new URL(cfg.authBase);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  return url.toString();
}

export async function exchangeAuthorizationCode(code: string): Promise<TokenSet> {
  const cfg = getHmrcConfig();
  const body = new URLSearchParams({
    client_secret: cfg.clientSecret,
    client_id: cfg.clientId,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
    code,
  });

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HMRC token exchange failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scopes: json.scope ?? HMRC_SCOPES.combined,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  const cfg = getHmrcConfig();
  const body = new URLSearchParams({
    client_secret: cfg.clientSecret,
    client_id: cfg.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HMRC token refresh failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scopes: json.scope ?? "",
  };
}

export function encryptTokenSet(tokens: TokenSet) {
  return {
    encryptedAccessToken: encryptSecret(tokens.accessToken),
    encryptedRefreshToken: encryptSecret(tokens.refreshToken),
    accessTokenExpiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  };
}

export function decryptAccessToken(encrypted: string): string {
  return decryptSecret(encrypted);
}

export function decryptRefreshToken(encrypted: string): string {
  return decryptSecret(encrypted);
}

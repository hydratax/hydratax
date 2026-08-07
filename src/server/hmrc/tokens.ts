import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { getHmrcConfig } from "./config";
import {
  decryptAccessToken,
  decryptRefreshToken,
  encryptTokenSet,
  refreshAccessToken,
  type TokenSet,
} from "./oauth";

export async function saveHmrcConnection(clientId: string, tokens: TokenSet) {
  const cfg = getHmrcConfig();
  const encrypted = encryptTokenSet(tokens);

  if (isDemoMode()) {
    const existing = demoStore.hmrcConnections.find((c) => c.clientId === clientId);
    if (existing) {
      existing.connected = true;
      existing.hmrcEnv = cfg.env;
      existing.scopes = tokens.scopes;
    } else {
      demoStore.hmrcConnections.push({
        clientId,
        connected: true,
        hmrcEnv: cfg.env,
        scopes: tokens.scopes,
      });
    }
    // Store encrypted tokens on the demo connection object
    Object.assign(
      demoStore.hmrcConnections.find((c) => c.clientId === clientId)!,
      encrypted,
    );
    return;
  }

  const { getDb } = await import("@/server/db");
  const { hmrcConnections } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDb();

  const existing = await db
    .select()
    .from(hmrcConnections)
    .where(eq(hmrcConnections.clientId, clientId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(hmrcConnections)
      .set({
        hmrcEnv: cfg.env,
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        accessTokenExpiresAt: encrypted.accessTokenExpiresAt,
        scopes: encrypted.scopes,
        updatedAt: new Date(),
      })
      .where(eq(hmrcConnections.clientId, clientId));
  } else {
    await db.insert(hmrcConnections).values({
      clientId,
      hmrcEnv: cfg.env,
      encryptedAccessToken: encrypted.encryptedAccessToken,
      encryptedRefreshToken: encrypted.encryptedRefreshToken,
      accessTokenExpiresAt: encrypted.accessTokenExpiresAt,
      scopes: encrypted.scopes,
    });
  }
}

export async function getHmrcConnectionStatus(clientId: string) {
  if (isDemoMode()) {
    const c = demoStore.hmrcConnections.find((x) => x.clientId === clientId);
    return {
      connected: Boolean(c?.connected),
      hmrcEnv: c?.hmrcEnv ?? getHmrcConfig().env,
      scopes: c?.scopes ?? "",
    };
  }

  const { getDb } = await import("@/server/db");
  const { hmrcConnections } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select()
    .from(hmrcConnections)
    .where(eq(hmrcConnections.clientId, clientId))
    .limit(1);
  const row = rows[0];
  return {
    connected: Boolean(row),
    hmrcEnv: row?.hmrcEnv ?? getHmrcConfig().env,
    scopes: row?.scopes ?? "",
  };
}

export async function getValidAccessToken(clientId: string): Promise<string | null> {
  if (isDemoMode()) {
    const c = demoStore.hmrcConnections.find((x) => x.clientId === clientId) as
      | (typeof demoStore.hmrcConnections)[number] & {
          encryptedAccessToken?: string;
          encryptedRefreshToken?: string;
          accessTokenExpiresAt?: Date;
        }
      | undefined;
    if (!c?.connected || !c.encryptedAccessToken) return null;
    return decryptAccessToken(c.encryptedAccessToken);
  }

  const { getDb } = await import("@/server/db");
  const { hmrcConnections } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select()
    .from(hmrcConnections)
    .where(eq(hmrcConnections.clientId, clientId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const expiresSoon =
    row.accessTokenExpiresAt.getTime() - Date.now() < 60_000;

  if (!expiresSoon) {
    return decryptAccessToken(row.encryptedAccessToken);
  }

  const refreshed = await refreshAccessToken(
    decryptRefreshToken(row.encryptedRefreshToken),
  );
  await saveHmrcConnection(clientId, refreshed);
  return refreshed.accessToken;
}

export async function disconnectHmrc(clientId: string) {
  if (isDemoMode()) {
    const c = demoStore.hmrcConnections.find((x) => x.clientId === clientId);
    if (c) {
      c.connected = false;
      c.scopes = "";
    }
    return;
  }

  const { getDb } = await import("@/server/db");
  const { hmrcConnections } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDb()
    .delete(hmrcConnections)
    .where(eq(hmrcConnections.clientId, clientId));
}

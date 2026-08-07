"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import {
  disconnectHmrc,
  getHmrcConnectionStatus,
} from "@/server/hmrc/tokens";
import { appendAuditEvent } from "@/server/audit/log";
import { getHmrcConfig } from "@/server/hmrc/config";

export async function getConnectionStatus(clientId: string) {
  await getClient(clientId);
  return getHmrcConnectionStatus(clientId);
}

export async function disconnectHmrcAction(clientId: string) {
  const session = await requireSession();
  await getClient(clientId);
  await disconnectHmrc(clientId);
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "hmrc.disconnect",
    entityType: "hmrc_connection",
    entityId: clientId,
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/settings/hmrc");
}

export async function getHmrcEnvInfo() {
  const cfg = getHmrcConfig();
  return {
    env: cfg.env,
    apiBase: cfg.apiBase,
    configured: Boolean(cfg.clientId && cfg.clientSecret),
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000"}/api/hmrc/callback`,
    hasEncryptionKey: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
    hasVendorIp: Boolean(process.env.HMRC_VENDOR_PUBLIC_IP),
  };
}

import { z } from "zod";
import { requireSession, type SessionContext } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { encryptSecret, decryptSecret } from "@/server/hmrc/crypto";
import { appendAuditEvent } from "@/server/audit/log";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { getSupabaseDataClient } from "@/server/db/supabase-data";
import { getHmrcConfig } from "@/server/hmrc/config";

export type GatewayCredentialPublic = {
  /** Decrypted Sender ID for the signed-in user only. Never includes password. */
  senderId: string | null;
  hasSavedPassword: boolean;
  updatedAt: string | null;
};

type StoredRow = {
  user_id: string;
  practice_id: string;
  client_id: string;
  sender_id_encrypted: string;
  password_encrypted: string | null;
  updated_at: string;
};

function assertCanWriteSecrets(session: SessionContext) {
  if (session.role === "readonly") {
    throw new Error("Read-only users cannot save Government Gateway credentials.");
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function loadOwnRow(
  session: SessionContext,
  clientId: string,
): Promise<StoredRow | null> {
  if (isDemoMode() || !isSupabaseConfigured() || !isUuid(session.userId)) {
    const row = demoStore.gatewayCredentials.find(
      (r) => r.userId === session.userId && r.clientId === clientId,
    );
    if (!row) return null;
    return {
      user_id: row.userId,
      practice_id: row.practiceId,
      client_id: row.clientId,
      sender_id_encrypted: row.senderIdEncrypted,
      password_encrypted: row.passwordEncrypted,
      updated_at: row.updatedAt,
    };
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("user_gateway_credentials")
    .select(
      "user_id, practice_id, client_id, sender_id_encrypted, password_encrypted, updated_at",
    )
    .eq("user_id", session.userId)
    .eq("client_id", clientId)
    .eq("practice_id", session.practiceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load Gateway credentials: ${error.message}`);
  }
  if (!data) return null;
  if (data.user_id !== session.userId) {
    throw new Error("Forbidden");
  }
  return data as StoredRow;
}

/** Public view for UI — never returns the password. */
export async function getMyGatewayCredentials(
  clientId: string,
): Promise<GatewayCredentialPublic> {
  const session = await requireSession();
  await getClient(clientId);
  const row = await loadOwnRow(session, clientId);
  if (!row) {
    return { senderId: null, hasSavedPassword: false, updatedAt: null };
  }
  let senderId: string | null = null;
  try {
    senderId = decryptSecret(row.sender_id_encrypted);
  } catch {
    senderId = null;
  }
  return {
    senderId,
    hasSavedPassword: Boolean(row.password_encrypted),
    updatedAt: row.updated_at,
  };
}

const saveSchema = z.object({
  clientId: z.string().min(1),
  senderId: z.string().min(1).max(64),
  /** When true and password provided, encrypt and store password for this user only. */
  rememberPassword: z.boolean().optional().default(false),
  password: z.string().max(256).optional(),
  /** When true, remove any previously saved password but keep Sender ID. */
  clearPassword: z.boolean().optional().default(false),
});

export async function saveMyGatewayCredentials(
  input: z.input<typeof saveSchema>,
) {
  const session = await requireSession();
  assertCanWriteSecrets(session);
  const data = saveSchema.parse(input);
  await getClient(data.clientId);

  const senderId = data.senderId.trim();
  if (!senderId) throw new Error("Government Gateway User ID is required.");

  const existing = await loadOwnRow(session, data.clientId);
  const senderIdEncrypted = encryptSecret(senderId);

  let passwordEncrypted: string | null = existing?.password_encrypted ?? null;
  if (data.clearPassword) {
    passwordEncrypted = null;
  } else if (data.rememberPassword) {
    const password = data.password?.trim() ?? "";
    if (!password) {
      throw new Error("Enter a password to remember, or turn off Remember password.");
    }
    passwordEncrypted = encryptSecret(password);
  }

  const updatedAt = new Date().toISOString();

  if (isDemoMode() || !isSupabaseConfigured() || !isUuid(session.userId)) {
    const idx = demoStore.gatewayCredentials.findIndex(
      (r) => r.userId === session.userId && r.clientId === data.clientId,
    );
    const next = {
      userId: session.userId,
      practiceId: session.practiceId,
      clientId: data.clientId,
      senderIdEncrypted,
      passwordEncrypted,
      updatedAt,
    };
    if (idx >= 0) demoStore.gatewayCredentials[idx] = next;
    else demoStore.gatewayCredentials.push(next);
  } else {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase.from("user_gateway_credentials").upsert(
      {
        user_id: session.userId,
        practice_id: session.practiceId,
        client_id: data.clientId,
        sender_id_encrypted: senderIdEncrypted,
        password_encrypted: passwordEncrypted,
        updated_at: updatedAt,
      },
      { onConflict: "user_id,client_id" },
    );
    if (error) {
      throw new Error(`Could not save Gateway credentials: ${error.message}`);
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: data.clearPassword
      ? "hmrc.gateway.credentials.password_clear"
      : data.rememberPassword
        ? "hmrc.gateway.credentials.save_with_password"
        : "hmrc.gateway.credentials.save_id",
    entityType: "user_gateway_credentials",
    entityId: data.clientId,
    detail: {
      rememberedPassword: Boolean(passwordEncrypted),
      // Never log secrets
    },
  });

  return {
    ok: true as const,
    senderId,
    hasSavedPassword: Boolean(passwordEncrypted),
  };
}

export async function clearMyGatewayCredentials(clientId: string) {
  const session = await requireSession();
  assertCanWriteSecrets(session);
  await getClient(clientId);

  if (isDemoMode() || !isSupabaseConfigured() || !isUuid(session.userId)) {
    demoStore.gatewayCredentials = demoStore.gatewayCredentials.filter(
      (r) => !(r.userId === session.userId && r.clientId === clientId),
    );
  } else {
    const supabase = await getSupabaseDataClient();
    if (!supabase) throw new Error("Supabase is not configured");
    const { error } = await supabase
      .from("user_gateway_credentials")
      .delete()
      .eq("user_id", session.userId)
      .eq("client_id", clientId)
      .eq("practice_id", session.practiceId);
    if (error) {
      throw new Error(`Could not clear Gateway credentials: ${error.message}`);
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "hmrc.gateway.credentials.clear",
    entityType: "user_gateway_credentials",
    entityId: clientId,
  });

  return { ok: true as const };
}

/**
 * Resolve Sender ID + password for an HMRC submit.
 * Password is decrypted only in-process for the owning user — never returned to the client.
 */
export async function resolveGatewayCredentialsForSubmit(opts: {
  clientId: string;
  senderId?: string | null;
  senderPassword?: string | null;
  useSavedPassword?: boolean;
  rememberPassword?: boolean;
}): Promise<{ senderId: string; senderPassword: string }> {
  const session = await requireSession();
  await getClient(opts.clientId);
  const cfg = getHmrcConfig();

  const typedId = opts.senderId?.trim() ?? "";
  const typedPassword = opts.senderPassword?.trim() ?? "";
  const row = await loadOwnRow(session, opts.clientId);

  let senderId = typedId;
  if (!senderId && row) {
    try {
      senderId = decryptSecret(row.sender_id_encrypted);
    } catch {
      senderId = "";
    }
  }
  if (!senderId && cfg.env !== "production") {
    senderId = cfg.ctTestSenderId;
  }

  let senderPassword = typedPassword;
  const wantSaved =
    opts.useSavedPassword === true || (!typedPassword && Boolean(row?.password_encrypted));
  if (!senderPassword && wantSaved && row?.password_encrypted) {
    try {
      senderPassword = decryptSecret(row.password_encrypted);
    } catch {
      throw new Error(
        "Saved Government Gateway password could not be decrypted. Re-enter it and save again.",
      );
    }
  }
  if (!senderPassword && cfg.env !== "production") {
    senderPassword = cfg.ctTestPassword;
  }

  if (!senderId || !senderPassword) {
    throw new Error(
      "Enter the Government Gateway User ID and password to submit to HMRC.",
    );
  }

  // Persist User ID always; password only when explicitly opted in.
  if (session.role !== "readonly" && typedId) {
    await saveMyGatewayCredentials({
      clientId: opts.clientId,
      senderId,
      rememberPassword: Boolean(opts.rememberPassword && typedPassword),
      password: opts.rememberPassword ? typedPassword : undefined,
    });
  }

  return { senderId, senderPassword };
}

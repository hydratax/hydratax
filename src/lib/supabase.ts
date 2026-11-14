import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppPhone } from "./whatsapp";

export type BotSessionStage =
  | "IDLE"
  | "AWAITING_VERIFICATION"
  | "AUTHENTICATED";

export type WhatsAppClient = {
  id: string;
  name: string;
  phone: string;
  verification_pin: string;
  practice_id: string | null;
};

export type BotSession = {
  phone: string;
  session_stage: BotSessionStage;
  client_id: string | null;
  pending_document_category: string | null;
  pending_tax_year: string | null;
  updated_at: string;
};

export type ClientStorageDocument = {
  id: string;
  client_id: string;
  category: string;
  tax_year: string | null;
  title: string;
  storage_path: string;
};

let adminClient: SupabaseClient | null = null;

/** Service-role client for Netlify WhatsApp webhook (bypasses RLS). */
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export async function findClientByPhone(
  phone: string,
): Promise<WhatsAppClient | null> {
  const normalized = normalizeWhatsAppPhone(phone);
  const { data, error } = await getSupabaseAdmin()
    .from("clients")
    .select("id, name, phone, verification_pin, practice_id")
    .eq("phone", normalized)
    .maybeSingle();

  if (error) throw error;
  return data as WhatsAppClient | null;
}

/**
 * Verify last 4 of tax ID / stored pin.
 * Accepts the full pin or any input whose last 4 digits match.
 */
export async function verifyClientPin(
  clientId: string,
  input: string,
  phone?: string,
): Promise<boolean> {
  return (await verifyClientPinLimited(clientId, input, phone)).ok;
}

export type PinCheck =
  | { ok: true; locked: false }
  | { ok: false; locked: boolean; retryAfterMin: number };

/**
 * PIN check with brute-force protection. The PIN is only 4 digits, so after
 * PIN_MAX_FAILURES wrong guesses (per phone and per client) further attempts
 * are refused for PIN_LOCK_MS — even a correct PIN — and the counter resets
 * only once that window has elapsed (NOT on HELP/CANCEL or session clears).
 */
export async function verifyClientPinLimited(
  clientId: string,
  input: string,
  phone?: string,
): Promise<PinCheck> {
  const keys = pinScopeKeys(clientId, phone);
  const lock = await pinLockStatus(keys);
  if (lock.locked) {
    return { ok: false, locked: true, retryAfterMin: lock.retryAfterMin };
  }

  const { data, error } = await getSupabaseAdmin()
    .from("clients")
    .select("verification_pin")
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw error;

  const expected = String(data?.verification_pin ?? "")
    .replace(/\D/g, "")
    .slice(-4);
  const provided = input.replace(/\D/g, "").slice(-4);
  const valid =
    expected.length === 4 &&
    provided.length === 4 &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(provided));

  if (valid) {
    await pinClear(keys);
    return { ok: true, locked: false };
  }

  const after = await pinRecordFailure(keys);
  return { ok: false, locked: after.locked, retryAfterMin: after.retryAfterMin };
}

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MS = 60 * 60 * 1000;

type PinState = { failures: number; windowStart: number; lockedUntil: number };

const pinMemory = new Map<string, PinState>();

function pinScopeKeys(clientId: string, phone?: string): string[] {
  const keys = [`client:${clientId}`];
  if (phone) keys.push(`phone:${normalizeWhatsAppPhone(phone)}`);
  return keys;
}

async function pinLoad(key: string, now: number): Promise<PinState> {
  const mem = pinMemory.get(key);
  let db: PinState | null = null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("bot_pin_attempts")
      .select("failures, window_started_at, locked_until")
      .eq("scope_key", key)
      .maybeSingle();
    // Table missing (migration not applied) => silently fall back to memory.
    if (!error && data) {
      db = {
        failures: Number(data.failures) || 0,
        windowStart: Date.parse(String(data.window_started_at)) || now,
        lockedUntil: data.locked_until ? Date.parse(String(data.locked_until)) : 0,
      };
    }
  } catch {
    /* memory fallback */
  }
  const merged: PinState = {
    failures: Math.max(mem?.failures ?? 0, db?.failures ?? 0),
    windowStart: Math.min(mem?.windowStart ?? now, db?.windowStart ?? now),
    lockedUntil: Math.max(mem?.lockedUntil ?? 0, db?.lockedUntil ?? 0),
  };
  // Window elapsed => counters reset (the only way a lock-out clears).
  if (merged.lockedUntil && merged.lockedUntil <= now) {
    return { failures: 0, windowStart: now, lockedUntil: 0 };
  }
  if (!merged.lockedUntil && now - merged.windowStart > PIN_LOCK_MS) {
    return { failures: 0, windowStart: now, lockedUntil: 0 };
  }
  return merged;
}

async function pinSave(key: string, state: PinState): Promise<void> {
  pinMemory.set(key, state);
  try {
    await getSupabaseAdmin()
      .from("bot_pin_attempts")
      .upsert(
        {
          scope_key: key,
          failures: state.failures,
          window_started_at: new Date(state.windowStart).toISOString(),
          locked_until: state.lockedUntil
            ? new Date(state.lockedUntil).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "scope_key" },
      );
  } catch {
    /* memory fallback */
  }
  if (pinMemory.size > 5000) {
    const first = pinMemory.keys().next().value;
    if (first) pinMemory.delete(first);
  }
}

async function pinLockStatus(
  keys: string[],
): Promise<{ locked: boolean; retryAfterMin: number }> {
  const now = Date.now();
  let until = 0;
  for (const key of keys) {
    const s = await pinLoad(key, now);
    if (s.lockedUntil > now) until = Math.max(until, s.lockedUntil);
  }
  return until
    ? { locked: true, retryAfterMin: Math.max(1, Math.ceil((until - now) / 60_000)) }
    : { locked: false, retryAfterMin: 0 };
}

async function pinRecordFailure(
  keys: string[],
): Promise<{ locked: boolean; retryAfterMin: number }> {
  const now = Date.now();
  let until = 0;
  for (const key of keys) {
    const s = await pinLoad(key, now);
    const failures = s.failures + 1;
    const lockedUntil =
      failures >= PIN_MAX_FAILURES ? now + PIN_LOCK_MS : s.lockedUntil;
    await pinSave(key, { failures, windowStart: s.windowStart, lockedUntil });
    if (lockedUntil > now) until = Math.max(until, lockedUntil);
  }
  return until
    ? { locked: true, retryAfterMin: Math.max(1, Math.ceil((until - now) / 60_000)) }
    : { locked: false, retryAfterMin: 0 };
}

/** A correct PIN clears the counters (never reached while a lock is active). */
async function pinClear(keys: string[]): Promise<void> {
  for (const key of keys) {
    pinMemory.delete(key);
    try {
      await getSupabaseAdmin().from("bot_pin_attempts").delete().eq("scope_key", key);
    } catch {
      /* ignore */
    }
  }
}

export async function getBotSession(phone: string): Promise<BotSession | null> {
  const normalized = normalizeWhatsAppPhone(phone);
  const { data, error } = await getSupabaseAdmin()
    .from("bot_sessions")
    .select(
      "phone, session_stage, client_id, pending_document_category, pending_tax_year, updated_at",
    )
    .eq("phone", normalized)
    .maybeSingle();

  if (error) throw error;
  return data as BotSession | null;
}

export async function upsertBotSession(
  phone: string,
  patch: Partial<
    Pick<
      BotSession,
      | "session_stage"
      | "client_id"
      | "pending_document_category"
      | "pending_tax_year"
    >
  >,
): Promise<BotSession> {
  const normalized = normalizeWhatsAppPhone(phone);
  const { data, error } = await getSupabaseAdmin()
    .from("bot_sessions")
    .upsert(
      {
        phone: normalized,
        session_stage: patch.session_stage ?? "IDLE",
        client_id: patch.client_id ?? null,
        pending_document_category: patch.pending_document_category ?? null,
        pending_tax_year: patch.pending_tax_year ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "phone" },
    )
    .select(
      "phone, session_stage, client_id, pending_document_category, pending_tax_year, updated_at",
    )
    .single();

  if (error) throw error;
  return data as BotSession;
}

export async function clearBotSession(phone: string): Promise<void> {
  await upsertBotSession(phone, {
    session_stage: "IDLE",
    client_id: null,
    pending_document_category: null,
    pending_tax_year: null,
  });
}

export async function findClientDocument(opts: {
  clientId: string;
  category: string;
  taxYear?: string | null;
}): Promise<ClientStorageDocument | null> {
  let query = getSupabaseAdmin()
    .from("client_storage_documents")
    .select("id, client_id, category, tax_year, title, storage_path")
    .eq("client_id", opts.clientId)
    .eq("category", opts.category)
    .order("created_at", { ascending: false })
    .limit(1);

  if (opts.taxYear) {
    query = query.eq("tax_year", opts.taxYear);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as ClientStorageDocument | null;
}

/** Temporary download link (15 minutes). */
export async function createDocumentSignedUrl(
  filePath: string,
): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .storage.from("documents")
    .createSignedUrl(filePath, 900);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Failed to create signed URL");
  return data.signedUrl;
}


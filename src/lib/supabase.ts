import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from("clients")
    .select("verification_pin")
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.verification_pin) return false;

  const expected = String(data.verification_pin).replace(/\D/g, "").slice(-4);
  const provided = input.replace(/\D/g, "").slice(-4);
  if (expected.length !== 4 || provided.length !== 4) return false;

  return timingSafeEqual(expected, provided);
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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

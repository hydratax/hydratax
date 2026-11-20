import { createHash, randomBytes } from "crypto";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";

export type WhatsAppAllocation = {
  practiceId: string;
  practiceName?: string | null;
  enabled: boolean;
  apiKeyPrefix: string | null;
  hasApiKey: boolean;
  monthlyMessageLimit: number;
  monthlyDocumentLimit: number;
  usedMessages: number;
  usedDocuments: number;
  periodYm: string;
  remainingMessages: number;
  remainingDocuments: number;
  label: string | null;
  notes: string | null;
  assignedAt: string | null;
};

type MemAlloc = {
  practiceId: string;
  enabled: boolean;
  apiKeyHash: string | null;
  apiKeyPrefix: string | null;
  monthlyMessageLimit: number;
  monthlyDocumentLimit: number;
  usedMessages: number;
  usedDocuments: number;
  periodYm: string;
  label: string | null;
  notes: string | null;
  assignedAt: string | null;
};

function currentPeriodYm() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7); // en-CA → YYYY-MM
}

function hashApiKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function generatePracticeWhatsAppKey() {
  const raw = `htwa_${randomBytes(24).toString("base64url")}`;
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, 12),
  };
}

function memStore(): { whatsappAllocations?: MemAlloc[] } {
  return demoStore as { whatsappAllocations?: MemAlloc[] };
}

function toPublic(row: MemAlloc, practiceName?: string | null): WhatsAppAllocation {
  const periodYm = currentPeriodYm();
  const usedMessages =
    row.periodYm === periodYm ? row.usedMessages : 0;
  const usedDocuments =
    row.periodYm === periodYm ? row.usedDocuments : 0;
  return {
    practiceId: row.practiceId,
    practiceName: practiceName ?? null,
    enabled: row.enabled,
    apiKeyPrefix: row.apiKeyPrefix,
    hasApiKey: Boolean(row.apiKeyHash),
    monthlyMessageLimit: row.monthlyMessageLimit,
    monthlyDocumentLimit: row.monthlyDocumentLimit,
    usedMessages,
    usedDocuments,
    periodYm,
    remainingMessages: Math.max(0, row.monthlyMessageLimit - usedMessages),
    remainingDocuments: Math.max(0, row.monthlyDocumentLimit - usedDocuments),
    label: row.label,
    notes: row.notes,
    assignedAt: row.assignedAt,
  };
}

function mapDbRow(
  row: Record<string, unknown>,
  practiceName?: string | null,
): WhatsAppAllocation {
  const periodYm = currentPeriodYm();
  const rowPeriod = String(row.period_ym ?? periodYm);
  const usedMessages =
    rowPeriod === periodYm ? Number(row.used_messages ?? 0) : 0;
  const usedDocuments =
    rowPeriod === periodYm ? Number(row.used_documents ?? 0) : 0;
  const msgLimit = Number(row.monthly_message_limit ?? 0);
  const docLimit = Number(row.monthly_document_limit ?? 0);
  return {
    practiceId: String(row.practice_id),
    practiceName: practiceName ?? null,
    enabled: Boolean(row.enabled),
    apiKeyPrefix: (row.api_key_prefix as string | null) ?? null,
    hasApiKey: Boolean(row.api_key_hash),
    monthlyMessageLimit: msgLimit,
    monthlyDocumentLimit: docLimit,
    usedMessages,
    usedDocuments,
    periodYm,
    remainingMessages: Math.max(0, msgLimit - usedMessages),
    remainingDocuments: Math.max(0, docLimit - usedDocuments),
    label: (row.label as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    assignedAt: (row.assigned_at as string | null) ?? null,
  };
}

export async function getPracticeWhatsAppAllocation(
  practiceId: string,
): Promise<WhatsAppAllocation | null> {
  if (isMemoryStore() || isDemoMode()) {
    const hit = (memStore().whatsappAllocations ?? []).find(
      (a) => a.practiceId === practiceId,
    );
    return hit ? toPublic(hit) : null;
  }
  if (!isSupabaseConfigured()) return null;
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { data, error } = await getSupabaseAdmin()
    .from("practice_whatsapp_allocations")
    .select("*")
    .eq("practice_id", practiceId)
    .maybeSingle();
  if (error || !data) return null;
  return mapDbRow(data as Record<string, unknown>);
}

export async function listWhatsAppAllocations(): Promise<WhatsAppAllocation[]> {
  if (isMemoryStore() || isDemoMode()) {
    return (memStore().whatsappAllocations ?? []).map((a) => toPublic(a));
  }
  if (!isSupabaseConfigured()) return [];
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from("practice_whatsapp_allocations")
    .select("*")
    .order("updated_at", { ascending: false });
  if (!rows?.length) return [];
  const ids = rows.map((r) => String((r as { practice_id: string }).practice_id));
  const { data: practices } = await supabase
    .from("practices")
    .select("id, name")
    .in("id", ids);
  const nameById = new Map(
    (practices ?? []).map((p) => [
      String((p as { id: string }).id),
      String((p as { name?: string }).name ?? ""),
    ]),
  );
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return mapDbRow(row, nameById.get(String(row.practice_id)) ?? null);
  });
}

export async function upsertPracticeWhatsAppAllocation(input: {
  practiceId: string;
  enabled: boolean;
  monthlyMessageLimit: number;
  monthlyDocumentLimit: number;
  label?: string | null;
  notes?: string | null;
  assignedBy?: string | null;
  rotateApiKey?: boolean;
}): Promise<{ allocation: WhatsAppAllocation; apiKeyPlaintext: string | null }> {
  const periodYm = currentPeriodYm();
  const now = new Date().toISOString();
  let apiKeyPlaintext: string | null = null;
  let apiKeyHash: string | null = null;
  let apiKeyPrefix: string | null = null;

  if (input.rotateApiKey) {
    const key = generatePracticeWhatsAppKey();
    apiKeyPlaintext = key.raw;
    apiKeyHash = key.hash;
    apiKeyPrefix = key.prefix;
  }

  if (isMemoryStore() || isDemoMode()) {
    const store = memStore();
    store.whatsappAllocations ??= [];
    const existing = store.whatsappAllocations.find(
      (a) => a.practiceId === input.practiceId,
    );
    if (existing) {
      existing.enabled = input.enabled;
      existing.monthlyMessageLimit = input.monthlyMessageLimit;
      existing.monthlyDocumentLimit = input.monthlyDocumentLimit;
      existing.label = input.label ?? existing.label;
      existing.notes = input.notes ?? existing.notes;
      existing.assignedAt = now;
      if (input.rotateApiKey) {
        existing.apiKeyHash = apiKeyHash;
        existing.apiKeyPrefix = apiKeyPrefix;
      }
      if (existing.periodYm !== periodYm) {
        existing.periodYm = periodYm;
        existing.usedMessages = 0;
        existing.usedDocuments = 0;
      }
      return { allocation: toPublic(existing), apiKeyPlaintext };
    }
    const row: MemAlloc = {
      practiceId: input.practiceId,
      enabled: input.enabled,
      apiKeyHash: apiKeyHash ?? hashApiKey(generatePracticeWhatsAppKey().raw),
      apiKeyPrefix: apiKeyPrefix ?? "htwa_****",
      monthlyMessageLimit: input.monthlyMessageLimit,
      monthlyDocumentLimit: input.monthlyDocumentLimit,
      usedMessages: 0,
      usedDocuments: 0,
      periodYm,
      label: input.label ?? null,
      notes: input.notes ?? null,
      assignedAt: now,
    };
    if (!input.rotateApiKey) {
      const key = generatePracticeWhatsAppKey();
      apiKeyPlaintext = key.raw;
      row.apiKeyHash = key.hash;
      row.apiKeyPrefix = key.prefix;
    }
    store.whatsappAllocations.push(row);
    return { allocation: toPublic(row), apiKeyPlaintext };
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Database is not configured");
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("practice_whatsapp_allocations")
    .select("*")
    .eq("practice_id", input.practiceId)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    practice_id: input.practiceId,
    enabled: input.enabled,
    monthly_message_limit: input.monthlyMessageLimit,
    monthly_document_limit: input.monthlyDocumentLimit,
    label: input.label ?? null,
    notes: input.notes ?? null,
    assigned_by: input.assignedBy ?? null,
    assigned_at: now,
    updated_at: now,
  };

  if (!existing) {
    const key = generatePracticeWhatsAppKey();
    apiKeyPlaintext = key.raw;
    patch.api_key_hash = key.hash;
    patch.api_key_prefix = key.prefix;
    patch.used_messages = 0;
    patch.used_documents = 0;
    patch.period_ym = periodYm;
  } else {
    if (input.rotateApiKey && apiKeyHash) {
      patch.api_key_hash = apiKeyHash;
      patch.api_key_prefix = apiKeyPrefix;
    }
    const rowPeriod = String(
      (existing as { period_ym?: string }).period_ym ?? "",
    );
    if (rowPeriod !== periodYm) {
      patch.period_ym = periodYm;
      patch.used_messages = 0;
      patch.used_documents = 0;
    }
  }

  const { data, error } = await supabase
    .from("practice_whatsapp_allocations")
    .upsert(patch, { onConflict: "practice_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return {
    allocation: mapDbRow(data as Record<string, unknown>),
    apiKeyPlaintext,
  };
}

/** Reserve 1 message (+ optional document) against the practice monthly quota. */
export async function consumeWhatsAppQuota(opts: {
  practiceId: string;
  documents?: number;
}): Promise<WhatsAppAllocation> {
  const docs = opts.documents ?? 0;
  const periodYm = currentPeriodYm();

  if (isMemoryStore() || isDemoMode()) {
    const hit = (memStore().whatsappAllocations ?? []).find(
      (a) => a.practiceId === opts.practiceId,
    );
    if (!hit || !hit.enabled) {
      throw new Error("WhatsApp is not enabled for this practice");
    }
    if (hit.periodYm !== periodYm) {
      hit.periodYm = periodYm;
      hit.usedMessages = 0;
      hit.usedDocuments = 0;
    }
    if (hit.usedMessages + 1 > hit.monthlyMessageLimit) {
      throw new Error("Monthly WhatsApp message allowance used up");
    }
    if (docs > 0 && hit.usedDocuments + docs > hit.monthlyDocumentLimit) {
      throw new Error("Monthly WhatsApp document allowance used up");
    }
    hit.usedMessages += 1;
    hit.usedDocuments += docs;
    return toPublic(hit);
  }

  if (!isSupabaseConfigured()) {
    throw new Error("Database is not configured");
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from("practice_whatsapp_allocations")
    .select("*")
    .eq("practice_id", opts.practiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || !(row as { enabled?: boolean }).enabled) {
    throw new Error("WhatsApp is not enabled for this practice");
  }
  const alloc = mapDbRow(row as Record<string, unknown>);
  if (alloc.remainingMessages < 1) {
    throw new Error("Monthly WhatsApp message allowance used up");
  }
  if (docs > 0 && alloc.remainingDocuments < docs) {
    throw new Error("Monthly WhatsApp document allowance used up");
  }

  const nextMessages =
    alloc.periodYm === periodYm ? alloc.usedMessages + 1 : 1;
  const nextDocs =
    alloc.periodYm === periodYm ? alloc.usedDocuments + docs : docs;

  const { data: updated, error: upErr } = await supabase
    .from("practice_whatsapp_allocations")
    .update({
      period_ym: periodYm,
      used_messages: nextMessages,
      used_documents: nextDocs,
      updated_at: new Date().toISOString(),
    })
    .eq("practice_id", opts.practiceId)
    .select("*")
    .single();
  if (upErr) throw new Error(upErr.message);
  return mapDbRow(updated as Record<string, unknown>);
}

export async function listPracticesForWhatsAppAdmin(): Promise<
  Array<{ id: string; name: string }>
> {
  if (isMemoryStore() || isDemoMode()) {
    return [{ id: "demo-practice", name: "Demo practice" }];
  }
  if (!isSupabaseConfigured()) return [];
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { data } = await getSupabaseAdmin()
    .from("practices")
    .select("id, name")
    .order("name", { ascending: true })
    .limit(500);
  return (data ?? []).map((p) => ({
    id: String((p as { id: string }).id),
    name: String((p as { name?: string }).name ?? "Practice"),
  }));
}

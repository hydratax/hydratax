import type { CsFilingRecord, CsFilingStatus } from "./types";
import { isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { hasDatabase } from "@/server/db";

type SupabaseCsRow = {
  id: string;
  status: string;
  company_number: string;
  company_name: string;
  confirmation_date: string;
  client_id: string | null;
  practice_id: string | null;
  encrypted_secrets: string | null;
  director_names: string[] | null;
  lawful_purpose_confirmed: boolean;
  registered_email: string | null;
  ch_transaction_ref: string | null;
  ch_submission_number: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export function canUseSupabaseCsStore() {
  return !isMemoryStore() && !hasDatabase() && isSupabaseConfigured();
}

async function storeClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    return getSupabaseAdmin();
  }
  const { createClient } = await import("@/lib/supabase/server");
  return createClient();
}

function fromRow(row: SupabaseCsRow): CsFilingRecord {
  return {
    id: row.id,
    status: row.status as CsFilingStatus,
    companyNumber: row.company_number,
    companyName: row.company_name,
    confirmationDate: row.confirmation_date,
    clientId: row.client_id,
    practiceId: row.practice_id,
    encryptedSecrets: row.encrypted_secrets,
    directorNames: row.director_names ?? [],
    lawfulPurposeConfirmed: row.lawful_purpose_confirmed,
    registeredEmail: row.registered_email,
    chTransactionRef: row.ch_transaction_ref,
    chSubmissionNumber: row.ch_submission_number,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function admin() {
  return storeClient();
}

export async function insertCsFilingRecord(record: CsFilingRecord) {
  const supabase = await admin();
  const { error } = await supabase.from("confirmation_statement_filings").insert({
    id: record.id,
    status: record.status,
    company_number: record.companyNumber,
    company_name: record.companyName,
    confirmation_date: record.confirmationDate,
    client_id: record.clientId,
    practice_id: record.practiceId,
    encrypted_secrets: record.encryptedSecrets,
    director_names: record.directorNames,
    lawful_purpose_confirmed: record.lawfulPurposeConfirmed,
    registered_email: record.registeredEmail,
  });
  if (error) throw new Error(error.message);
}

export async function loadCsFilingRecord(
  filingId: string,
): Promise<CsFilingRecord | null> {
  const supabase = await admin();
  const { data, error } = await supabase
    .from("confirmation_statement_filings")
    .select("*")
    .eq("id", filingId)
    .maybeSingle();
  if (error || !data) return null;
  return fromRow(data as SupabaseCsRow);
}

export async function patchCsFilingRecord(
  filingId: string,
  patch: Partial<
    Pick<
      CsFilingRecord,
      "status" | "lastError" | "chSubmissionNumber" | "chTransactionRef"
    >
  >,
) {
  const supabase = await admin();
  const { error } = await supabase
    .from("confirmation_statement_filings")
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.lastError !== undefined ? { last_error: patch.lastError } : {}),
      ...(patch.chSubmissionNumber !== undefined
        ? { ch_submission_number: patch.chSubmissionNumber }
        : {}),
      ...(patch.chTransactionRef !== undefined
        ? { ch_transaction_ref: patch.chTransactionRef }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", filingId);
  if (error) throw new Error(error.message);
}

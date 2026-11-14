/**
 * Remove every store that `deleteClient()` in src/server/actions/clients.ts
 * does NOT reach: Cloudflare D1 desk tables, R2 / Supabase Storage objects,
 * `client_documents` rows (no FK to clients), tables whose FK is not
 * ON DELETE CASCADE, and client-linked rows with ON DELETE SET NULL
 * (messages, tasks, activity). Idempotent and best-effort per step.
 *
 * Authorisation is the CALLER's job (see actions/privacy.ts and deleteClient).
 * `practiceId` is always re-applied in the WHERE so a client id from another
 * practice can never be purged.
 */

import { isD1Configured, d1Execute } from "@/server/db/d1";
import { deleteR2Objects } from "@/server/privacy/r2-delete";
import {
  privacyAdminClient,
  runStep,
  type StepResult,
} from "@/server/privacy/db";

/** Supabase tables keyed by client_id that must be cleared before the client row. */
export const SUPABASE_CLIENT_KEYED_TABLES = [
  "payroll_timesheets", // FK without ON DELETE CASCADE in the first migration
  "pay_runs",
  "employees",
  "ledger_entries",
  "vat_returns",
  "ct600_returns",
  "bank_transactions",
  "client_email_logs",
  "client_document_requests",
  "practice_time_entries",
  "user_gateway_credentials",
  "client_invoices",
  "confirmation_statement_filings",
  "hmrc_connections",
] as const;

/** D1 desk tables keyed by client_id. */
export const D1_CLIENT_KEYED_TABLES = [
  "employees",
  "pay_runs",
  "payroll_timesheets",
  "ledger_entries",
  "vat_returns",
  "bank_transactions",
  "ct600_returns",
] as const;

export async function purgeClientStores(
  clientId: string,
  practiceId: string,
): Promise<StepResult[]> {
  const results: StepResult[] = [];

  // --- Cloudflare D1 (heavy desk data) ----------------------------------
  if (isD1Configured()) {
    for (const table of D1_CLIENT_KEYED_TABLES) {
      try {
        // Table name comes from a constant allow-list above, never user input.
        await d1Execute(`DELETE FROM ${table} WHERE client_id = ?`, [clientId]);
        results.push({ step: `d1.${table}`, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(
          /no such table/i.test(msg)
            ? { step: `d1.${table}`, ok: true, skipped: true }
            : { step: `d1.${table}`, ok: false, error: msg.slice(0, 200) },
        );
      }
    }
  }

  const admin = privacyAdminClient();
  if (!admin) return results;

  // --- Uploaded documents (R2 + metadata rows) --------------------------
  try {
    const { data, error } = await admin
      .from("client_documents")
      .select("r2_key")
      .eq("client_id", clientId)
      .eq("practice_id", practiceId)
      .limit(100000);
    if (!error) {
      const n = await deleteR2Objects((data ?? []).map((r) => r.r2_key));
      results.push({ step: "r2.client_documents", ok: true, count: n });
    }
  } catch (err) {
    results.push({
      step: "r2.client_documents",
      ok: false,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  results.push(
    await runStep("client_documents", () =>
      admin
        .from("client_documents")
        .delete({ count: "exact" })
        .eq("client_id", clientId)
        .eq("practice_id", practiceId),
    ),
  );

  // --- WhatsApp-bot document index (Supabase Storage bucket "documents") -
  try {
    const { data } = await admin
      .from("client_storage_documents")
      .select("storage_path")
      .eq("client_id", clientId);
    const paths = (data ?? [])
      .map((r) => r.storage_path as string)
      .filter((p) => typeof p === "string" && p && !p.includes(".."));
    if (paths.length) {
      await admin.storage.from("documents").remove(paths);
    }
    results.push({
      step: "storage.client_storage_documents",
      ok: true,
      count: paths.length,
    });
  } catch {
    results.push({
      step: "storage.client_storage_documents",
      ok: true,
      skipped: true,
    });
  }

  // --- Task-inbox attachments linked to this client ---------------------
  try {
    const { data } = await admin
      .from("practice_tasks")
      .select("storage_key")
      .eq("client_id", clientId)
      .eq("practice_id", practiceId);
    const n = await deleteR2Objects((data ?? []).map((r) => r.storage_key));
    results.push({ step: "r2.practice_tasks", ok: true, count: n });
  } catch {
    results.push({ step: "r2.practice_tasks", ok: true, skipped: true });
  }

  // --- Rows with ON DELETE SET NULL that still hold the client's data ----
  for (const [table, scoped] of [
    ["practice_tasks", true],
    ["client_channel_messages", true],
    ["practice_activity_logs", true],
    ["bot_sessions", false],
  ] as const) {
    results.push(
      await runStep(table, () => {
        let q = admin.from(table).delete({ count: "exact" }).eq("client_id", clientId);
        if (scoped) q = q.eq("practice_id", practiceId);
        return q;
      }),
    );
  }

  // --- Tables whose FK to clients is missing / not cascading -------------
  for (const table of SUPABASE_CLIENT_KEYED_TABLES) {
    results.push(
      await runStep(table, () =>
        admin.from(table).delete({ count: "exact" }).eq("client_id", clientId),
      ),
    );
  }

  return results;
}

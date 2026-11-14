/**
 * Processor-side tooling: export a client's data and count residuals after
 * erasure. Callers (actions/privacy.ts) must have run `assertPracticeAdmin`
 * and verified `client.practiceId === session.practiceId` first.
 */

import { isD1Configured, d1Query } from "@/server/db/d1";
import { LEGAL_ENTITY } from "@/lib/legal-entity";
import {
  D1_CLIENT_KEYED_TABLES,
  SUPABASE_CLIENT_KEYED_TABLES,
} from "@/server/privacy/client-purge";
import { privacyAdminClient } from "@/server/privacy/db";
import {
  shapeClientExport,
  type ClientDataExport,
  type ClientExportInput,
} from "@/server/privacy/export-shape";
import type { StatutoryHold } from "@/server/privacy/authz";

type Row = Record<string, unknown>;

async function safeRows(
  fn: () => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<Row[]> {
  try {
    const { data, error } = await fn();
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

async function deskRows(
  loader: (clientId: string) => Promise<unknown[] | null>,
  clientId: string,
): Promise<Row[]> {
  try {
    return ((await loader(clientId)) ?? []) as Row[];
  } catch {
    return [];
  }
}

/**
 * Gather everything we hold for one client. `clientRow` is the already
 * authorised client record (session-scoped fetch).
 */
export async function buildClientDataExport(opts: {
  clientId: string;
  practiceId: string;
  clientRow: Row;
}): Promise<ClientDataExport> {
  const { clientId, practiceId } = opts;
  const desk = await import("@/server/db/desk-store");
  const admin = privacyAdminClient();

  const [employees, payRuns, timesheets, ledger, vat, ct600, bank] =
    await Promise.all([
      deskRows(desk.deskListEmployees, clientId),
      deskRows(desk.deskListPayRuns, clientId),
      deskRows(desk.deskListTimesheets, clientId),
      deskRows(desk.deskListLedger, clientId),
      deskRows(desk.deskListVatReturns, clientId),
      deskRows(desk.deskListCt600Returns, clientId),
      deskRows(desk.deskListBankTransactions, clientId),
    ]);

  let documents: Row[] = [];
  let invoices: Row[] = [];
  let emailLogs: Row[] = [];
  let channelMessages: Row[] = [];
  let tasks: Row[] = [];
  let auditEvents: Row[] = [];

  if (admin) {
    [documents, invoices, emailLogs, channelMessages, tasks, auditEvents] =
      await Promise.all([
        safeRows(() =>
          admin
            .from("client_documents")
            .select("id, filename, content_type, size_bytes, category, created_at")
            .eq("client_id", clientId)
            .eq("practice_id", practiceId)
            .limit(5000),
        ),
        safeRows(() =>
          admin.from("client_invoices").select("*").eq("client_id", clientId).limit(5000),
        ),
        safeRows(() =>
          admin
            .from("client_email_logs")
            .select("from_email, to_email, subject, message_preview, kind, document_count, delivery, created_at")
            .eq("client_id", clientId)
            .eq("practice_id", practiceId)
            .limit(5000),
        ),
        safeRows(() =>
          admin
            .from("client_channel_messages")
            .select("*")
            .eq("client_id", clientId)
            .eq("practice_id", practiceId)
            .limit(5000),
        ),
        safeRows(() =>
          admin
            .from("practice_tasks")
            .select("id, kind, status, title, body, from_address, source, filename, created_at")
            .eq("client_id", clientId)
            .eq("practice_id", practiceId)
            .limit(5000),
        ),
        safeRows(() =>
          admin
            .from("audit_events")
            .select("action, entity_type, entity_id, hmrc_status_code, created_at")
            .eq("client_id", clientId)
            .eq("practice_id", practiceId)
            .order("created_at", { ascending: false })
            .limit(5000),
        ),
      ]);
  }

  const input: ClientExportInput = {
    clientId,
    practiceId,
    client: opts.clientRow,
    employees,
    payRuns,
    timesheets,
    ledgerEntries: ledger,
    vatReturns: vat,
    ct600Returns: ct600,
    saSubmissions: [],
    bankTransactions: bank,
    documents,
    invoices,
    emailLogs,
    channelMessages,
    tasks,
    auditEvents,
  };

  return shapeClientExport(input, {
    legalName: LEGAL_ENTITY.legalName,
    contact: LEGAL_ENTITY.privacyEmail,
  });
}

/** Submitted returns / evidence the practice may be legally required to keep. */
export async function collectStatutoryHolds(
  clientId: string,
  practiceId: string,
): Promise<StatutoryHold[]> {
  const holds: StatutoryHold[] = [];
  const desk = await import("@/server/db/desk-store");

  const submitted = (rows: Row[]) =>
    rows.filter((r) => r.submitted_at ?? r.submittedAt).length;

  const [vat, ct600] = await Promise.all([
    deskRows(desk.deskListVatReturns, clientId),
    deskRows(desk.deskListCt600Returns, clientId),
  ]);
  holds.push({
    kind: "vat_returns",
    count: submitted(vat),
    description:
      "Submitted MTD VAT returns (keep 6 years — HMRC VAT Notice 700/21).",
  });
  holds.push({
    kind: "ct600_returns",
    count: submitted(ct600),
    description:
      "Submitted CT600 returns (keep 6 years from the end of the accounting period).",
  });

  const admin = privacyAdminClient();
  if (admin) {
    try {
      const { count } = await admin
        .from("audit_events")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("practice_id", practiceId)
        .not("hmrc_correlation_id", "is", null);
      holds.push({
        kind: "hmrc_submission_evidence",
        count: count ?? 0,
        description:
          "HMRC submission audit evidence (retained pseudonymously by HydraTax for 7 years; not removed by client erasure).",
      });
    } catch {
      /* table absent */
    }
  }
  return holds;
}

/** Evidence after erasure: per-store residual row counts (only non-zero). */
export async function countClientResiduals(
  clientId: string,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};

  if (isD1Configured()) {
    for (const table of D1_CLIENT_KEYED_TABLES) {
      try {
        const rows = await d1Query<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${table} WHERE client_id = ?`,
          [clientId],
        );
        const n = Number(rows[0]?.n ?? 0);
        if (n > 0) out[`d1.${table}`] = n;
      } catch {
        /* table absent */
      }
    }
  }

  const admin = privacyAdminClient();
  if (admin) {
    for (const table of [
      ...SUPABASE_CLIENT_KEYED_TABLES,
      "client_documents",
      "practice_tasks",
      "client_channel_messages",
    ]) {
      try {
        const { count, error } = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("client_id", clientId);
        if (!error && (count ?? 0) > 0) out[table] = count ?? 0;
      } catch {
        /* table absent */
      }
    }
    try {
      const { count } = await admin
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("id", clientId);
      if ((count ?? 0) > 0) out.clients = count ?? 0;
    } catch {
      /* ignore */
    }
  }
  return out;
}

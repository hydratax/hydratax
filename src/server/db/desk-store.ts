import {
  isD1Configured,
  d1Batch,
  d1BoolInt,
  d1Execute,
  d1Json,
  d1ParseJson,
  d1Query,
} from "@/server/db/d1";
import {
  getSupabaseDataClient,
  mapSnakeCaseRow,
} from "@/server/db/supabase-data";
import { isSupabaseConfigured } from "@/lib/env";

/** Prefer Cloudflare D1 for heavy desk data when configured. */
export function isDeskD1Configured(): boolean {
  return isD1Configured();
}

export function isDeskStoreConfigured(): boolean {
  return isD1Configured() || isSupabaseConfigured();
}

function newId() {
  return crypto.randomUUID();
}

// ── Employees ──────────────────────────────────────────────────────────────

export async function deskListEmployees(clientId: string) {
  if (isD1Configured()) {
    return d1Query(
      "SELECT * FROM employees WHERE client_id = ? ORDER BY created_at ASC",
      [clientId],
    );
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load employees: ${error.message}`);
  return data ?? [];
}

export async function deskInsertEmployee(row: Record<string, unknown>) {
  if (isD1Configured()) {
    await d1Execute(
      `INSERT INTO employees (
        id, client_id, forename, surname, nino, tax_code, annual_salary_pence,
        start_date, payroll_id, pay_frequency, ni_category, job_title, leave_date,
        starter_declaration, first_fps_sent, previous_payroll_id, hours_per_week,
        hourly_rate_pence, pay_basis, pension_opt_out, ssp_qualifying_days,
        bf_tax_year, bf_taxable_pence, bf_tax_pence, bf_employee_ni_pence, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.client_id,
        row.forename,
        row.surname,
        row.nino,
        row.tax_code,
        row.annual_salary_pence,
        row.start_date,
        row.payroll_id ?? null,
        row.pay_frequency ?? "M1",
        row.ni_category ?? "A",
        row.job_title ?? null,
        row.leave_date ?? null,
        row.starter_declaration ?? null,
        d1BoolInt(Boolean(row.first_fps_sent)),
        row.previous_payroll_id ?? null,
        row.hours_per_week ?? 3750,
        row.hourly_rate_pence ?? 0,
        row.pay_basis ?? "salary",
        d1BoolInt(Boolean(row.pension_opt_out)),
        row.ssp_qualifying_days ?? 5,
        row.bf_tax_year ?? null,
        row.bf_taxable_pence ?? 0,
        row.bf_tax_pence ?? 0,
        row.bf_employee_ni_pence ?? 0,
        d1BoolInt(row.active !== false),
      ],
    );
    return;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { error } = await supabase.from("employees").insert(row);
  if (error) throw new Error(`Could not add employee: ${error.message}`);
}

export async function deskUpdateEmployee(
  employeeId: string,
  clientId: string,
  patch: Record<string, unknown>,
) {
  if (isD1Configured()) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      sets.push(`${key} = ?`);
      if (typeof value === "boolean") params.push(d1BoolInt(value));
      else params.push(value);
    }
    if (!sets.length) return;
    params.push(employeeId, clientId);
    await d1Execute(
      `UPDATE employees SET ${sets.join(", ")} WHERE id = ? AND client_id = ?`,
      params,
    );
    return;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { error } = await supabase
    .from("employees")
    .update(patch)
    .eq("id", employeeId)
    .eq("client_id", clientId);
  if (error) throw new Error(`Could not update employee: ${error.message}`);
}

export async function deskMarkEmployeesFpsSent(clientId: string, ids: string[]) {
  if (!ids.length) return;
  if (isD1Configured()) {
    const placeholders = ids.map(() => "?").join(",");
    await d1Execute(
      `UPDATE employees SET first_fps_sent = 1, previous_payroll_id = NULL
       WHERE client_id = ? AND id IN (${placeholders})`,
      [clientId, ...ids],
    );
    return;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { error } = await supabase
    .from("employees")
    .update({ first_fps_sent: true, previous_payroll_id: null })
    .in("id", ids)
    .eq("client_id", clientId);
  if (error) throw new Error(`Could not update employees: ${error.message}`);
}

// ── Pay runs ───────────────────────────────────────────────────────────────

export async function deskListPayRuns(clientId: string) {
  if (isD1Configured()) {
    const rows = await d1Query(
      "SELECT * FROM pay_runs WHERE client_id = ? ORDER BY pay_date DESC",
      [clientId],
    );
    return rows.map((row) => ({
      ...row,
      totals: d1ParseJson(row.totals, {}),
      lines: d1ParseJson(row.lines, []),
    }));
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("pay_runs")
    .select("*")
    .eq("client_id", clientId)
    .order("pay_date", { ascending: false });
  if (error) throw new Error(`Could not load pay runs: ${error.message}`);
  return data ?? [];
}

export async function deskInsertPayRun(row: Record<string, unknown>) {
  if (isD1Configured()) {
    await d1Execute(
      `INSERT INTO pay_runs (
        id, client_id, pay_date, period_start, period_end, pay_frequency, kind,
        status, totals, lines, fps_xml_hash, hmrc_correlation_id, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.client_id,
        row.pay_date,
        row.period_start,
        row.period_end,
        row.pay_frequency ?? "M1",
        row.kind ?? "FPS",
        row.status ?? "draft",
        d1Json(row.totals ?? {}),
        d1Json(row.lines ?? []),
        row.fps_xml_hash ?? null,
        row.hmrc_correlation_id ?? null,
        row.submitted_at ?? null,
      ],
    );
    return;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { error } = await supabase.from("pay_runs").insert(row);
  if (error) throw new Error(`Could not save pay run: ${error.message}`);
}

// ── Timesheets ─────────────────────────────────────────────────────────────

export async function deskListTimesheets(clientId: string) {
  if (isD1Configured()) {
    const rows = await d1Query(
      "SELECT * FROM payroll_timesheets WHERE client_id = ? ORDER BY created_at DESC",
      [clientId],
    );
    return rows.map((row) => ({
      ...row,
      rows: d1ParseJson(row.rows, []),
    }));
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("payroll_timesheets")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load timesheets: ${error.message}`);
  return data ?? [];
}

export async function deskUpsertTimesheet(row: {
  id?: string;
  client_id: string;
  period_start: string;
  period_end: string;
  filename: string;
  rows: unknown;
}) {
  const id = row.id ?? newId();
  if (isD1Configured()) {
    await d1Execute(
      `INSERT INTO payroll_timesheets (id, client_id, period_start, period_end, filename, rows)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         period_start = excluded.period_start,
         period_end = excluded.period_end,
         filename = excluded.filename,
         rows = excluded.rows`,
      [
        id,
        row.client_id,
        row.period_start,
        row.period_end,
        row.filename,
        d1Json(row.rows),
      ],
    );
    return id;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { error } = await supabase.from("payroll_timesheets").upsert({
    id,
    client_id: row.client_id,
    period_start: row.period_start,
    period_end: row.period_end,
    filename: row.filename,
    rows: row.rows,
  });
  if (error) throw new Error(`Could not save timesheet: ${error.message}`);
  return id;
}

// ── Ledger ─────────────────────────────────────────────────────────────────

export async function deskListLedger(clientId: string) {
  if (isD1Configured()) {
    return d1Query(
      "SELECT * FROM ledger_entries WHERE client_id = ? ORDER BY dated DESC",
      [clientId],
    );
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("client_id", clientId)
    .order("dated", { ascending: false });
  if (error) throw new Error(`Could not load ledger: ${error.message}`);
  return data ?? [];
}

export async function deskInsertLedger(row: Record<string, unknown>) {
  const id = String(row.id ?? newId());
  if (isD1Configured()) {
    await d1Execute(
      `INSERT INTO ledger_entries (
        id, client_id, type, description, amount_pence, vat_rate_bps, vat_pence,
        dated, category, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        row.client_id,
        row.type,
        row.description,
        row.amount_pence,
        row.vat_rate_bps ?? 2000,
        row.vat_pence,
        row.dated,
        row.category ?? null,
        row.created_by,
      ],
    );
    const rows = await d1Query("SELECT * FROM ledger_entries WHERE id = ?", [id]);
    return rows[0] ?? { ...row, id };
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { data, error } = await supabase
    .from("ledger_entries")
    .insert({ ...row, id })
    .select("*")
    .single();
  if (error) throw new Error(`Could not save ledger entry: ${error.message}`);
  return data;
}

// ── VAT ────────────────────────────────────────────────────────────────────

export async function deskListVatReturns(clientId: string) {
  if (isD1Configured()) {
    const rows = await d1Query(
      "SELECT * FROM vat_returns WHERE client_id = ? ORDER BY created_at DESC",
      [clientId],
    );
    return rows.map((row) => ({
      ...row,
      boxes: d1ParseJson(row.boxes, {}),
    }));
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("vat_returns")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load VAT returns: ${error.message}`);
  return data ?? [];
}

export async function deskSaveVatReturn(draft: {
  id: string;
  clientId: string;
  periodKey: string;
  status: string;
  boxes: unknown;
}) {
  if (isD1Configured()) {
    const existing = await d1Query(
      "SELECT id FROM vat_returns WHERE client_id = ? AND period_key = ? LIMIT 1",
      [draft.clientId, draft.periodKey],
    );
    if (existing[0]) {
      await d1Execute(
        "UPDATE vat_returns SET status = ?, boxes = ? WHERE id = ?",
        [draft.status, d1Json(draft.boxes), existing[0].id],
      );
      const rows = await d1Query("SELECT * FROM vat_returns WHERE id = ?", [
        existing[0].id,
      ]);
      const row = rows[0]!;
      return {
        ...mapSnakeCaseRow(row),
        boxes: d1ParseJson(row.boxes, {}),
      };
    }
    await d1Execute(
      `INSERT INTO vat_returns (id, client_id, period_key, status, boxes)
       VALUES (?, ?, ?, ?, ?)`,
      [
        draft.id,
        draft.clientId,
        draft.periodKey,
        draft.status,
        d1Json(draft.boxes),
      ],
    );
    return {
      id: draft.id,
      clientId: draft.clientId,
      periodKey: draft.periodKey,
      status: draft.status,
      boxes: draft.boxes,
    };
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return null;
  const { data: existing, error: findError } = await supabase
    .from("vat_returns")
    .select("id")
    .eq("client_id", draft.clientId)
    .eq("period_key", draft.periodKey)
    .maybeSingle();
  if (findError) {
    throw new Error(`Could not load VAT return: ${findError.message}`);
  }
  const query = existing
    ? supabase
        .from("vat_returns")
        .update({ status: draft.status, boxes: draft.boxes })
        .eq("id", existing.id)
    : supabase.from("vat_returns").insert({
        id: draft.id,
        client_id: draft.clientId,
        period_key: draft.periodKey,
        status: draft.status,
        boxes: draft.boxes,
      });
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(`Could not save VAT return: ${error.message}`);
  return mapSnakeCaseRow(data);
}

export async function deskUpdateVatReturn(
  clientId: string,
  periodKey: string,
  patch: Record<string, unknown>,
) {
  if (isD1Configured()) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      sets.push(`${key} = ?`);
      params.push(key === "boxes" ? d1Json(value) : value);
    }
    params.push(clientId, periodKey);
    await d1Execute(
      `UPDATE vat_returns SET ${sets.join(", ")} WHERE client_id = ? AND period_key = ?`,
      params,
    );
    return;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return;
  const { error } = await supabase
    .from("vat_returns")
    .update(patch)
    .eq("client_id", clientId)
    .eq("period_key", periodKey);
  if (error) throw new Error(`Could not update VAT return: ${error.message}`);
}

// ── CT600 ──────────────────────────────────────────────────────────────────

export async function deskListCt600Returns(clientId: string) {
  // CT600 lives in Supabase (migration applied there). Prefer it so a
  // misconfigured / incomplete D1 schema cannot hang the Corporation Tax tab.
  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("ct600_returns")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Could not load CT600 returns: ${error.message}`);
    return data ?? [];
  }
  if (isD1Configured()) {
    try {
      const rows = await d1Query(
        "SELECT * FROM ct600_returns WHERE client_id = ? ORDER BY created_at DESC",
        [clientId],
      );
      return rows.map((row) => ({
        ...row,
        figures: d1ParseJson(row.figures, {}),
        questionnaire: d1ParseJson(row.questionnaire, {}),
        validation_issues: d1ParseJson(row.validation_issues, null),
      }));
    } catch {
      return [];
    }
  }
  return null;
}

export async function deskFindCt600ByPeriod(
  clientId: string,
  periodStart: string,
  periodEnd: string,
) {
  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("ct600_returns")
      .select("*")
      .eq("client_id", clientId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Could not load CT600 return: ${error.message}`);
    return data;
  }
  if (isD1Configured()) {
    try {
      const rows = await d1Query(
        `SELECT * FROM ct600_returns
         WHERE client_id = ? AND period_start = ? AND period_end = ?
         ORDER BY created_at DESC LIMIT 1`,
        [clientId, periodStart, periodEnd],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        figures: d1ParseJson(row.figures, {}),
        questionnaire: d1ParseJson(row.questionnaire, {}),
        validation_issues: d1ParseJson(row.validation_issues, null),
      };
    } catch {
      return null;
    }
  }
  return null;
}

export async function deskSaveCt600Return(row: {
  id: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  figures: unknown;
  questionnaire?: unknown;
  taxableProfitPence?: number | null;
  xmlPayloadHash?: string | null;
  validationIssues?: unknown;
}) {
  const id = row.id;
  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("ct600_returns")
      .upsert(
        {
          id,
          client_id: row.clientId,
          period_start: row.periodStart,
          period_end: row.periodEnd,
          status: row.status,
          figures: row.figures,
          questionnaire: row.questionnaire ?? {},
          taxable_profit_pence: row.taxableProfitPence ?? null,
          xml_payload_hash: row.xmlPayloadHash ?? null,
          validation_issues: row.validationIssues ?? null,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(`Could not save CT600 return: ${error.message}`);
    return data;
  }
  if (isD1Configured()) {
    await d1Execute(
      `INSERT INTO ct600_returns (
        id, client_id, period_start, period_end, status, figures, questionnaire,
        taxable_profit_pence, xml_payload_hash, validation_issues
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        figures = excluded.figures,
        questionnaire = excluded.questionnaire,
        taxable_profit_pence = excluded.taxable_profit_pence,
        xml_payload_hash = excluded.xml_payload_hash,
        validation_issues = excluded.validation_issues`,
      [
        id,
        row.clientId,
        row.periodStart,
        row.periodEnd,
        row.status,
        d1Json(row.figures),
        d1Json(row.questionnaire ?? {}),
        row.taxableProfitPence ?? null,
        row.xmlPayloadHash ?? null,
        row.validationIssues ? d1Json(row.validationIssues) : null,
      ],
    );
    const rows = await d1Query("SELECT * FROM ct600_returns WHERE id = ?", [id]);
    return rows[0] ?? null;
  }
  return null;
}

export async function deskGetCt600Return(id: string, clientId: string) {
  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("ct600_returns")
      .select("*")
      .eq("id", id)
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) throw new Error(`Could not load CT600 return: ${error.message}`);
    return data;
  }
  if (isD1Configured()) {
    try {
      const rows = await d1Query(
        "SELECT * FROM ct600_returns WHERE id = ? AND client_id = ? LIMIT 1",
        [id, clientId],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        figures: d1ParseJson(row.figures, {}),
        questionnaire: d1ParseJson(row.questionnaire, {}),
        validation_issues: d1ParseJson(row.validation_issues, null),
      };
    } catch {
      return null;
    }
  }
  return null;
}

export async function deskUpdateCt600Return(
  id: string,
  clientId: string,
  patch: Record<string, unknown>,
) {
  const supabase = await getSupabaseDataClient();
  if (supabase) {
    const { error } = await supabase
      .from("ct600_returns")
      .update(patch)
      .eq("id", id)
      .eq("client_id", clientId);
    if (error) throw new Error(`Could not update CT600 return: ${error.message}`);
    return;
  }
  if (isD1Configured()) {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      sets.push(`${key} = ?`);
      params.push(
        key === "figures" || key === "questionnaire" || key === "validation_issues"
          ? d1Json(value)
          : value,
      );
    }
    params.push(id, clientId);
    await d1Execute(
      `UPDATE ct600_returns SET ${sets.join(", ")} WHERE id = ? AND client_id = ?`,
      params,
    );
  }
}

// ── Bank ───────────────────────────────────────────────────────────────────

export async function deskListBankTransactions(clientId: string) {
  if (isD1Configured()) {
    return d1Query(
      "SELECT * FROM bank_transactions WHERE client_id = ? ORDER BY dated DESC",
      [clientId],
    );
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("bank_transactions")
    .select("*")
    .eq("client_id", clientId)
    .order("dated", { ascending: false });
  if (error) {
    throw new Error(`Could not load bank transactions: ${error.message}`);
  }
  return data ?? [];
}

export async function deskDeleteBankTransactionsForClient(clientId: string) {
  if (isD1Configured()) {
    await d1Execute("DELETE FROM bank_transactions WHERE client_id = ?", [
      clientId,
    ]);
    return;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { error } = await supabase
    .from("bank_transactions")
    .delete()
    .eq("client_id", clientId);
  if (error) {
    throw new Error(`Could not clear bank transactions: ${error.message}`);
  }
}

/** Remove exact duplicate rows (same date, description, amount), keeping the oldest id. */
export async function deskDedupeBankTransactionsForClient(
  clientId: string,
): Promise<number> {
  const rows = await deskListBankTransactions(clientId);
  if (!rows?.length) return 0;

  const seen = new Map<string, string>();
  const deleteIds: string[] = [];
  for (const row of rows) {
    const id = String(row.id);
    const dated = String(row.dated ?? "");
    const description = String(row.description ?? "");
    const amountPence = Number(row.amount_pence ?? 0);
    const key = `${dated}|${description}|${amountPence}`;
    if (!seen.has(key)) {
      seen.set(key, id);
    } else {
      deleteIds.push(id);
    }
  }
  if (!deleteIds.length) return 0;

  if (isD1Configured()) {
    const chunkSize = 50;
    for (let i = 0; i < deleteIds.length; i += chunkSize) {
      const chunk = deleteIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      await d1Execute(
        `DELETE FROM bank_transactions WHERE client_id = ? AND id IN (${placeholders})`,
        [clientId, ...chunk],
      );
    }
    return deleteIds.length;
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const chunkSize = 100;
  for (let i = 0; i < deleteIds.length; i += chunkSize) {
    const chunk = deleteIds.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("bank_transactions")
      .delete()
      .eq("client_id", clientId)
      .in("id", chunk);
    if (error) {
      throw new Error(`Could not remove duplicate transactions: ${error.message}`);
    }
  }
  return deleteIds.length;
}

/** Replace all bank lines for a client (used on CSV re-import). */
export async function deskReplaceBankTransactions(
  clientId: string,
  rows: Array<Record<string, unknown>>,
) {
  if (isD1Configured()) {
    const statements: Array<{ sql: string; params?: unknown[] }> = [
      {
        sql: "DELETE FROM bank_transactions WHERE client_id = ?",
        params: [clientId],
      },
    ];
    const d1ChunkSize = 12;
    for (let i = 0; i < rows.length; i += d1ChunkSize) {
      const chunk = rows.slice(i, i + d1ChunkSize);
      const placeholders = chunk
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      const params: unknown[] = [];
      for (const row of chunk) {
        params.push(
          row.id ?? newId(),
          row.client_id,
          row.dated,
          row.description,
          row.amount_pence,
          row.balance_pence ?? null,
          row.category ?? null,
          row.matched_ledger_id ?? null,
        );
      }
      statements.push({
        sql: `INSERT INTO bank_transactions (
          id, client_id, dated, description, amount_pence, balance_pence,
          category, matched_ledger_id
        ) VALUES ${placeholders}`,
        params,
      });
    }
    await d1Batch(statements);
    return;
  }

  await deskDeleteBankTransactionsForClient(clientId);
  await deskInsertBankTransactions(rows);
}

export async function deskInsertBankTransactions(
  rows: Array<Record<string, unknown>>,
) {
  if (!rows.length) return;
  // D1/SQLite caps bound parameters per statement (~100); 8 cols → max ~12 rows.
  const d1ChunkSize = 12;
  const supabaseChunkSize = 100;
  if (isD1Configured()) {
    for (let i = 0; i < rows.length; i += d1ChunkSize) {
      const chunk = rows.slice(i, i + d1ChunkSize);
      const placeholders = chunk
        .map(() => "(?, ?, ?, ?, ?, ?, ?, ?)")
        .join(", ");
      const params: unknown[] = [];
      for (const row of chunk) {
        params.push(
          row.id ?? newId(),
          row.client_id,
          row.dated,
          row.description,
          row.amount_pence,
          row.balance_pence ?? null,
          row.category ?? null,
          row.matched_ledger_id ?? null,
        );
      }
      await d1Execute(
        `INSERT INTO bank_transactions (
          id, client_id, dated, description, amount_pence, balance_pence,
          category, matched_ledger_id
        ) VALUES ${placeholders}`,
        params,
      );
    }
    return;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  for (let i = 0; i < rows.length; i += supabaseChunkSize) {
    const chunk = rows.slice(i, i + supabaseChunkSize);
    const { error } = await supabase.from("bank_transactions").insert(chunk);
    if (error) {
      throw new Error(`Could not save bank transactions: ${error.message}`);
    }
  }
}

export async function deskUpdateBankCategory(
  transactionId: string,
  category: string,
) {
  if (isD1Configured()) {
    await d1Execute("UPDATE bank_transactions SET category = ? WHERE id = ?", [
      category,
      transactionId,
    ]);
    const rows = await d1Query(
      "SELECT client_id FROM bank_transactions WHERE id = ? LIMIT 1",
      [transactionId],
    );
    return rows[0] ? String(rows[0].client_id) : null;
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { data, error } = await supabase
    .from("bank_transactions")
    .update({ category })
    .eq("id", transactionId)
    .select("client_id")
    .maybeSingle();
  if (error) throw new Error(`Could not update bank category: ${error.message}`);
  return data?.client_id ? String(data.client_id) : null;
}

export async function deskUpdateBankCategoriesBulk(
  transactionIds: string[],
  category: string,
): Promise<string | null> {
  if (!transactionIds.length) return null;

  if (isD1Configured()) {
    const chunkSize = 50;
    for (let i = 0; i < transactionIds.length; i += chunkSize) {
      const chunk = transactionIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      await d1Execute(
        `UPDATE bank_transactions SET category = ? WHERE id IN (${placeholders})`,
        [category, ...chunk],
      );
    }
    const rows = await d1Query(
      "SELECT client_id FROM bank_transactions WHERE id = ? LIMIT 1",
      [transactionIds[0]],
    );
    return rows[0] ? String(rows[0].client_id) : null;
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const chunkSize = 100;
  for (let i = 0; i < transactionIds.length; i += chunkSize) {
    const chunk = transactionIds.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("bank_transactions")
      .update({ category })
      .in("id", chunk);
    if (error) {
      throw new Error(`Could not update bank categories: ${error.message}`);
    }
  }
  const { data } = await supabase
    .from("bank_transactions")
    .select("client_id")
    .eq("id", transactionIds[0])
    .maybeSingle();
  return data?.client_id ? String(data.client_id) : null;
}

// ── Custom bank categories ───────────────────────────────────────────────────

export async function deskListCustomBankCategories(
  practiceId: string,
): Promise<Array<{ id: string; label: string }>> {
  if (isD1Configured()) {
    try {
      const rows = await d1Query<{ id: string; label: string }>(
        "SELECT id, label FROM custom_bank_categories WHERE practice_id = ? ORDER BY label ASC",
        [practiceId],
      );
      return rows.map((r) => ({ id: String(r.id), label: String(r.label) }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/no such table:\s*custom_bank_categories/i.test(msg)) {
        // Migration not applied yet — bank page should still load.
        console.warn(
          "[desk] custom_bank_categories missing; run: npm run d1:migrate:remote",
        );
        return [];
      }
      throw err;
    }
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("custom_bank_categories")
    .select("id, label")
    .eq("practice_id", practiceId)
    .order("label");
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: String(r.id),
    label: String(r.label),
  }));
}

export async function deskCreateCustomBankCategory(
  practiceId: string,
  label: string,
): Promise<{ id: string; label: string }> {
  const id = newId();
  if (isD1Configured()) {
    await d1Execute(
      "INSERT INTO custom_bank_categories (id, practice_id, label) VALUES (?, ?, ?)",
      [id, practiceId, label],
    );
    return { id, label };
  }
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error("Desk storage is not configured");
  const { error } = await supabase.from("custom_bank_categories").insert({
    id,
    practice_id: practiceId,
    label,
  });
  if (error) {
    throw new Error(`Could not create custom category: ${error.message}`);
  }
  return { id, label };
}

export { mapSnakeCaseRow };

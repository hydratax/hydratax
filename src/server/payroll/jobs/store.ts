/**
 * Supabase service-role accessors for bulk import + RTI submit jobs.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  BULK_IMPORT_COMPANIES_PER_TICK,
  RTI_SUBMIT_PER_TICK,
} from "./constants";
import type { PackCompanyItem, PackMatchKind } from "./pack-manifest";

export type BulkImportJobRow = {
  id: string;
  practice_id: string;
  created_by: string | null;
  kind: string;
  status: string;
  source_label: string | null;
  artifact_key: string | null;
  total_items: number;
  completed_items: number;
  failed_items: number;
  progress_pct: number;
  error_summary: string | null;
  meta: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BulkImportJobItemRow = {
  id: string;
  job_id: string;
  practice_id: string;
  client_id: string | null;
  match_key: string;
  match_kind: PackMatchKind;
  filename: string | null;
  status: string;
  csv_text: string | null;
  employees_created: number;
  employees_updated: number;
  employees_skipped: number;
  error_message: string | null;
  claimed_at: string | null;
  claimed_by: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RtiSubmitJobRow = {
  id: string;
  practice_id: string;
  client_id: string;
  pay_run_id: string | null;
  kind: "FPS" | "EPS";
  status: string;
  priority: number;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  correlation_id: string | null;
  envelope_xml: string | null;
  meta: Record<string, unknown>;
  created_by: string | null;
};

function admin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required for payroll jobs");
  }
  return getSupabaseAdmin();
}

export async function enqueueBulkImportJob(opts: {
  practiceId: string;
  createdBy?: string | null;
  sourceLabel?: string | null;
  artifactKey?: string | null;
  items: PackCompanyItem[];
  meta?: Record<string, unknown>;
}): Promise<{ jobId: string; itemCount: number }> {
  const sb = admin();
  const { data: job, error } = await sb
    .from("bulk_import_jobs")
    .insert({
      practice_id: opts.practiceId,
      created_by: opts.createdBy ?? null,
      kind: "employee_csv_pack",
      status: "queued",
      source_label: opts.sourceLabel ?? null,
      artifact_key: opts.artifactKey ?? null,
      total_items: opts.items.length,
      meta: opts.meta ?? {},
    })
    .select("id")
    .single();
  if (error || !job) {
    throw new Error(error?.message || "Could not create bulk import job");
  }

  const rows = opts.items.map((item) => ({
    job_id: job.id as string,
    practice_id: opts.practiceId,
    match_key: item.matchKey,
    match_kind: item.matchKind,
    filename: item.filename,
    status: "queued",
    csv_text: item.csvText,
  }));

  // Insert in chunks to stay under payload limits
  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error: itemErr } = await sb.from("bulk_import_job_items").insert(slice);
    if (itemErr) {
      await sb
        .from("bulk_import_jobs")
        .update({
          status: "failed",
          error_summary: itemErr.message,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      throw new Error(itemErr.message);
    }
  }

  return { jobId: job.id as string, itemCount: opts.items.length };
}

export async function claimBulkImportItems(
  limit = BULK_IMPORT_COMPANIES_PER_TICK,
  worker = "cron",
): Promise<BulkImportJobItemRow[]> {
  const sb = admin();
  const { data, error } = await sb.rpc("claim_bulk_import_job_items", {
    p_limit: limit,
    p_worker: worker,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BulkImportJobItemRow[];
}

export async function markBulkImportItemResult(
  item: BulkImportJobItemRow,
  result: {
    status: "completed" | "failed" | "skipped";
    clientId?: string | null;
    created?: number;
    updated?: number;
    skipped?: number;
    errorMessage?: string | null;
  },
) {
  const sb = admin();
  const now = new Date().toISOString();
  await sb
    .from("bulk_import_job_items")
    .update({
      status: result.status,
      client_id: result.clientId ?? item.client_id,
      employees_created: result.created ?? 0,
      employees_updated: result.updated ?? 0,
      employees_skipped: result.skipped ?? 0,
      error_message: result.errorMessage ?? null,
      // Drop CSV payload after success to shrink row size
      csv_text: result.status === "completed" ? null : item.csv_text,
      finished_at: now,
      updated_at: now,
    })
    .eq("id", item.id);

  // Refresh job counters
  const { data: items } = await sb
    .from("bulk_import_job_items")
    .select("status")
    .eq("job_id", item.job_id);
  const list = items ?? [];
  const completed = list.filter((r) => r.status === "completed").length;
  const failed = list.filter(
    (r) => r.status === "failed" || r.status === "skipped",
  ).length;
  const total = list.length;
  const done = list.every((r) =>
    ["completed", "failed", "skipped"].includes(String(r.status)),
  );
  const progress = total ? Math.round(((completed + failed) / total) * 100) : 0;

  const jobPatch: Record<string, unknown> = {
    status: done ? (failed === total ? "failed" : "completed") : "running",
    completed_items: completed,
    failed_items: failed,
    progress_pct: progress,
    finished_at: done ? now : null,
    updated_at: now,
  };
  if (done && failed === total) {
    jobPatch.error_summary = "All company items failed or were skipped.";
  }

  const { data: jobRow } = await sb
    .from("bulk_import_jobs")
    .select("started_at")
    .eq("id", item.job_id)
    .maybeSingle();
  if (!jobRow?.started_at) {
    jobPatch.started_at = now;
  }

  await sb.from("bulk_import_jobs").update(jobPatch).eq("id", item.job_id);
}

export async function resolveClientForPackItem(opts: {
  practiceId: string;
  matchKey: string;
  matchKind: PackMatchKind;
}): Promise<{ id: string } | null> {
  const sb = admin();
  let q = sb
    .from("clients")
    .select("id")
    .eq("practice_id", opts.practiceId)
    .limit(1);

  if (opts.matchKind === "client_id") {
    q = q.eq("id", opts.matchKey);
  } else if (opts.matchKind === "paye_ref") {
    q = q.eq("paye_ref", opts.matchKey.replace(/\s+/g, ""));
  } else {
    q = q.eq("company_number", opts.matchKey.toUpperCase());
  }

  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { id: String(data.id) } : null;
}

export async function getBulkImportJob(
  jobId: string,
): Promise<BulkImportJobRow | null> {
  const sb = admin();
  const { data, error } = await sb
    .from("bulk_import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BulkImportJobRow) ?? null;
}

export async function enqueueRtiSubmitJob(opts: {
  practiceId: string;
  clientId: string;
  payRunId?: string | null;
  kind: "FPS" | "EPS";
  envelopeXml?: string | null;
  createdBy?: string | null;
  priority?: number;
  meta?: Record<string, unknown>;
}): Promise<{ jobId: string }> {
  const sb = admin();
  const { data, error } = await sb
    .from("rti_submit_jobs")
    .insert({
      practice_id: opts.practiceId,
      client_id: opts.clientId,
      pay_run_id: opts.payRunId ?? null,
      kind: opts.kind,
      status: "queued",
      priority: opts.priority ?? 100,
      envelope_xml: opts.envelopeXml ?? null,
      created_by: opts.createdBy ?? null,
      meta: opts.meta ?? {},
      next_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Could not enqueue RTI submit job");
  }
  return { jobId: data.id as string };
}

export async function claimRtiSubmitJobs(
  limit = RTI_SUBMIT_PER_TICK,
  worker = "cron",
): Promise<RtiSubmitJobRow[]> {
  const sb = admin();
  const { data, error } = await sb.rpc("claim_rti_submit_jobs", {
    p_limit: limit,
    p_worker: worker,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RtiSubmitJobRow[];
}

export async function completeRtiSubmitJob(
  jobId: string,
  result: {
    ok: boolean;
    correlationId?: string | null;
    error?: string | null;
    retryDelayMs?: number;
  },
) {
  const sb = admin();
  const now = new Date().toISOString();
  if (result.ok) {
    await sb
      .from("rti_submit_jobs")
      .update({
        status: "completed",
        correlation_id: result.correlationId ?? null,
        finished_at: now,
        updated_at: now,
        envelope_xml: null,
      })
      .eq("id", jobId);
    return;
  }

  const { data } = await sb
    .from("rti_submit_jobs")
    .select("attempt_count, max_attempts")
    .eq("id", jobId)
    .maybeSingle();
  const attempts = Number(data?.attempt_count ?? 1);
  const max = Number(data?.max_attempts ?? 5);
  if (attempts >= max) {
    await sb
      .from("rti_submit_jobs")
      .update({
        status: "failed",
        last_error: result.error ?? "RTI submit failed",
        finished_at: now,
        updated_at: now,
      })
      .eq("id", jobId);
    return;
  }

  const delay = result.retryDelayMs ?? 60_000 * attempts;
  await sb
    .from("rti_submit_jobs")
    .update({
      status: "queued",
      last_error: result.error ?? "RTI submit failed",
      next_attempt_at: new Date(Date.now() + delay).toISOString(),
      updated_at: now,
    })
    .eq("id", jobId);
}

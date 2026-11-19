/**
 * Process one tick of bulk import + (optional) RTI submit queue.
 * Designed for Netlify scheduled functions / `/api/cron/payroll-jobs`.
 */

import { applyEmployeeCsvToClient } from "@/server/payroll/employee-csv-apply";
import {
  BULK_IMPORT_COMPANIES_PER_TICK,
  RTI_MIN_GAP_MS,
  RTI_QUEUE_LIVE_ENABLED,
  RTI_SUBMIT_PER_TICK,
} from "./constants";
import {
  claimBulkImportItems,
  claimRtiSubmitJobs,
  completeRtiSubmitJob,
  markBulkImportItemResult,
  resolveClientForPackItem,
  type BulkImportJobItemRow,
} from "./store";

export type PayrollJobsTickSummary = {
  bulkClaimed: number;
  bulkCompleted: number;
  bulkFailed: number;
  bulkSkipped: number;
  rtiClaimed: number;
  rtiCompleted: number;
  rtiFailed: number;
  rtiQueueLive: boolean;
  errors: string[];
};

async function processBulkItem(item: BulkImportJobItemRow): Promise<"completed" | "failed" | "skipped"> {
  const client = await resolveClientForPackItem({
    practiceId: item.practice_id,
    matchKey: item.match_key,
    matchKind: item.match_kind,
  });
  if (!client) {
    await markBulkImportItemResult(item, {
      status: "skipped",
      errorMessage: `No client matched ${item.match_kind}=${item.match_key}`,
    });
    return "skipped";
  }
  if (!item.csv_text?.trim()) {
    await markBulkImportItemResult(item, {
      status: "failed",
      clientId: client.id,
      errorMessage: "Missing CSV payload on job item",
    });
    return "failed";
  }

  try {
    const result = await applyEmployeeCsvToClient({
      clientId: client.id,
      csvText: item.csv_text,
    });
    if (!result.ok) {
      await markBulkImportItemResult(item, {
        status: "failed",
        clientId: client.id,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        errorMessage:
          result.errors[0]?.message || "CSV produced no employee creates/updates",
      });
      return "failed";
    }
    await markBulkImportItemResult(item, {
      status: "completed",
      clientId: client.id,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    });
    return "completed";
  } catch (err) {
    await markBulkImportItemResult(item, {
      status: "failed",
      clientId: client.id,
      errorMessage: err instanceof Error ? err.message : "Import failed",
    });
    return "failed";
  }
}

/** Process one claimed RTI job (caller only claims when queue live is enabled). */
async function processRtiItem(job: Awaited<ReturnType<typeof claimRtiSubmitJobs>>[number]) {
  if (!job.envelope_xml?.trim()) {
    await completeRtiSubmitJob(job.id, {
      ok: false,
      error: "No envelope_xml on RTI job — build FPS/EPS before enqueue.",
    });
    return "failed";
  }

  try {
    // Dynamic import keeps cron cold-start lighter when queue is empty.
    const { submitAndPollRtiXml } = await import("@/server/hmrc/rti-submit");
    const meta = job.meta || {};
    const senderId = String(meta.senderId || "");
    const senderPassword = String(meta.senderPassword || "");
    const payeRef = String(meta.payeRef || "");
    if (!senderId || !senderPassword || !payeRef) {
      await completeRtiSubmitJob(job.id, {
        ok: false,
        error: "RTI job meta missing senderId / senderPassword / payeRef",
      });
      return "failed";
    }

    const res = await submitAndPollRtiXml({
      xml: job.envelope_xml,
      kind: job.kind,
      payeRef,
      senderId,
      senderPassword,
      actorId: job.created_by || "rti-queue",
      clientId: job.client_id,
      practiceId: job.practice_id,
      demo: Boolean(meta.demo),
    });
    await completeRtiSubmitJob(job.id, {
      ok: res.ok,
      correlationId: res.correlationId,
    });
    await new Promise((r) => setTimeout(r, RTI_MIN_GAP_MS));
    return res.ok ? ("completed" as const) : ("failed" as const);
  } catch (err) {
    await completeRtiSubmitJob(job.id, {
      ok: false,
      error: err instanceof Error ? err.message : "RTI submit error",
    });
    await new Promise((r) => setTimeout(r, RTI_MIN_GAP_MS));
    return "failed";
  }
}

/** One worker tick — safe for serverless time budgets. */
export async function runPayrollJobsTick(opts?: {
  bulkLimit?: number;
  rtiLimit?: number;
  worker?: string;
}): Promise<PayrollJobsTickSummary> {
  const summary: PayrollJobsTickSummary = {
    bulkClaimed: 0,
    bulkCompleted: 0,
    bulkFailed: 0,
    bulkSkipped: 0,
    rtiClaimed: 0,
    rtiCompleted: 0,
    rtiFailed: 0,
    rtiQueueLive: RTI_QUEUE_LIVE_ENABLED,
    errors: [],
  };

  const worker = opts?.worker ?? "cron";

  try {
    const items = await claimBulkImportItems(
      opts?.bulkLimit ?? BULK_IMPORT_COMPANIES_PER_TICK,
      worker,
    );
    summary.bulkClaimed = items.length;
    for (const item of items) {
      const status = await processBulkItem(item);
      if (status === "completed") summary.bulkCompleted += 1;
      else if (status === "skipped") summary.bulkSkipped += 1;
      else summary.bulkFailed += 1;
    }
  } catch (err) {
    summary.errors.push(
      err instanceof Error ? err.message : "bulk import tick failed",
    );
  }

  // Only claim RTI rows when live queue is enabled — otherwise stubs sit queued.
  if (RTI_QUEUE_LIVE_ENABLED) {
    try {
      const rtiJobs = await claimRtiSubmitJobs(
        opts?.rtiLimit ?? RTI_SUBMIT_PER_TICK,
        worker,
      );
      summary.rtiClaimed = rtiJobs.length;
      for (const job of rtiJobs) {
        const status = await processRtiItem(job);
        if (status === "completed") summary.rtiCompleted += 1;
        else summary.rtiFailed += 1;
      }
    } catch (err) {
      summary.errors.push(
        err instanceof Error ? err.message : "rti submit tick failed",
      );
    }
  }

  return summary;
}

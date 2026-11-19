/**
 * RTI FPS/EPS submit throttle helpers.
 *
 * Model: one submission per employer EmpRef (PAYE reference). A bureau with
 * ~1000 companies must post ~1000 separate FPS envelopes — never one mega-FPS.
 *
 * Live queue processing is off by default (`RTI_SUBMIT_QUEUE_ENABLED`). Desk
 * single-company submit continues to call `submitAndPollRtiXml` directly.
 * See docs/payroll/RTI-VOLUME-AND-HMRC-LIMITS.md.
 */

import {
  RTI_MIN_GAP_MS,
  RTI_QUEUE_LIVE_ENABLED,
} from "@/server/payroll/jobs/constants";
import { enqueueRtiSubmitJob } from "@/server/payroll/jobs/store";

export { RTI_MIN_GAP_MS, RTI_QUEUE_LIVE_ENABLED };

export type RtiThrottleDecision =
  | { mode: "sync"; reason: "queue_disabled" | "single_company" }
  | { mode: "queue"; reason: "queue_enabled" };

/**
 * Decide whether this submit should go sync (desk) or into the DB queue.
 * Never breaks existing single-company desk flow when the flag is off.
 */
export function decideRtiSubmitPath(opts?: {
  forceQueue?: boolean;
}): RtiThrottleDecision {
  if (opts?.forceQueue || RTI_QUEUE_LIVE_ENABLED) {
    return { mode: "queue", reason: "queue_enabled" };
  }
  return { mode: "sync", reason: "queue_disabled" };
}

/**
 * Enqueue an FPS/EPS for later throttled submit.
 * Does not send to HMRC. Credentials must be stored in meta by the caller
 * only when the practice explicitly opted into queued submit (never log them).
 */
export async function enqueueThrottledRtiSubmit(opts: {
  practiceId: string;
  clientId: string;
  payRunId?: string | null;
  kind: "FPS" | "EPS";
  envelopeXml: string;
  createdBy?: string | null;
  priority?: number;
  /** Opaque meta — include payeRef; avoid persisting passwords when possible. */
  meta?: Record<string, unknown>;
}): Promise<{ jobId: string }> {
  return enqueueRtiSubmitJob({
    practiceId: opts.practiceId,
    clientId: opts.clientId,
    payRunId: opts.payRunId,
    kind: opts.kind,
    envelopeXml: opts.envelopeXml,
    createdBy: opts.createdBy,
    priority: opts.priority,
    meta: opts.meta,
  });
}

/**
 * Sleep helper for in-process multi-submit loops (scripts / future bureau desk).
 * Prefer the DB queue for serverless — this is for sequential script use.
 */
export async function throttleRtiGap(ms = RTI_MIN_GAP_MS): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/** Recommended max concurrent in-flight Transaction Engine submits from HydraTax. */
export const RTI_RECOMMENDED_MAX_IN_FLIGHT = 2;

/** Rough bureau day capacity at RTI_MIN_GAP_MS with 1 worker (ignoring poll time). */
export function estimateDailyRtiCapacity(opts?: {
  gapMs?: number;
  hours?: number;
  workers?: number;
}): number {
  const gap = opts?.gapMs ?? RTI_MIN_GAP_MS;
  const hours = opts?.hours ?? 10;
  const workers = opts?.workers ?? 1;
  const perWorker = Math.floor((hours * 60 * 60 * 1000) / gap);
  return perWorker * workers;
}

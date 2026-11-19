/**
 * Scheduled tick for bureau bulk import + optional RTI submit queue.
 * Add schedule in netlify.toml when ready to run in production.
 */

import { runPayrollJobsTick } from "../../src/server/payroll/jobs/processor";

type NetlifyResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export default async function handler(): Promise<NetlifyResponse> {
  try {
    const summary = await runPayrollJobsTick({ worker: "netlify-cron" });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: summary.errors.length === 0, ...summary }),
    };
  } catch (err) {
    console.error(
      "[payroll-jobs-cron]",
      err instanceof Error ? err.name : "error",
    );
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Cron job failed" }),
    };
  }
}

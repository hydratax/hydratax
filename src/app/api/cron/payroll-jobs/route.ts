import { NextResponse } from "next/server";
import { authorizeBearer } from "@/lib/webhook-auth";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/server/privacy/security-events";
import { runPayrollJobsTick } from "@/server/payroll/jobs/processor";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Process bulk import + (optional) RTI submit queue ticks.
 * Auth: Authorization: Bearer $CRON_SECRET only.
 */
export async function GET(req: Request) {
  const auth = authorizeBearer(req, process.env.CRON_SECRET, "Cron");
  if (!auth.ok) {
    const ip = clientIpFromHeaders(req.headers);
    await logSecurityEvent({
      type: "webhook.unauthorised",
      severity: auth.status === 401 ? "medium" : "low",
      ip,
      throttleKey: `cron.payroll-jobs:${ip}`,
      details: { route: "cron.payroll-jobs", status: auth.status },
    });
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }

  try {
    const summary = await runPayrollJobsTick({ worker: "api-cron" });
    return NextResponse.json(
      { ok: summary.errors.length === 0, ...summary },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error(
      "[cron payroll-jobs]",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { ok: false, error: "Cron job failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}

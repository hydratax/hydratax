import { NextResponse } from "next/server";
import { sendFilingReminders } from "@/server/billing/filing-reminders";
import { sendCompanyFilingReminders } from "@/server/billing/company-filing-reminders";
import { checkR2StorageQuota } from "@/server/storage/r2-quota";
import { authorizeBearer } from "@/lib/webhook-auth";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { runRetentionJobsBestEffort } from "@/server/privacy/retention";
import { logSecurityEvent } from "@/server/privacy/security-events";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Manual/platform cron: filing reminders + R2 quota alerts + data retention.
 * Auth: `Authorization: Bearer $CRON_SECRET` only (query-string secrets leak
 * into logs). Fails closed (503) when CRON_SECRET is not configured.
 */
export async function GET(req: Request) {
  const auth = authorizeBearer(req, process.env.CRON_SECRET, "Cron");
  if (!auth.ok) {
    const ip = clientIpFromHeaders(req.headers);
    await logSecurityEvent({
      type: "webhook.unauthorised",
      severity: auth.status === 401 ? "medium" : "low",
      ip,
      throttleKey: `cron.notifications:${ip}`,
      details: { route: "cron.notifications", status: auth.status },
    });
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }
  // Best-effort UK GDPR storage-limitation clean-up. Runs first and never
  // throws, so a failing reminder job cannot starve retention (or vice versa).
  const retention = await runRetentionJobsBestEffort();
  try {
    const [filingReminders, companyFilingReminders, r2Quota] =
      await Promise.all([
        sendFilingReminders(),
        sendCompanyFilingReminders(),
        checkR2StorageQuota(),
      ]);
    return NextResponse.json(
      {
        ok: true,
        filingReminders,
        companyFilingReminders,
        r2Quota,
        retention,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[cron notifications]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Cron job failed", retention },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}

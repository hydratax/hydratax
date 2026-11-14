import { NextResponse } from "next/server";
import { sendTrialEndingReminders } from "@/server/billing/trial-reminders";
import { authorizeBearer } from "@/lib/webhook-auth";
import { clientIpFromHeaders } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/server/privacy/security-events";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Manual / platform cron endpoint for day-7 trial ending emails.
 * Auth: `Authorization: Bearer $CRON_SECRET` only. Fails closed (503) when
 * CRON_SECRET is not configured.
 */
export async function GET(req: Request) {
  const auth = authorizeBearer(req, process.env.CRON_SECRET, "Cron");
  if (!auth.ok) {
    const ip = clientIpFromHeaders(req.headers);
    await logSecurityEvent({
      type: "webhook.unauthorised",
      severity: auth.status === 401 ? "medium" : "low",
      ip,
      throttleKey: `cron.trial-reminders:${ip}`,
      details: { route: "cron.trial-reminders", status: auth.status },
    });
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status, headers: NO_STORE },
    );
  }

  try {
    const result = await sendTrialEndingReminders();
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (err) {
    console.error("[cron trial-reminders]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Cron job failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}

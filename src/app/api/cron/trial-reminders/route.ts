import { NextResponse } from "next/server";
import { sendTrialEndingReminders } from "@/server/billing/trial-reminders";

/**
 * Manual / platform cron endpoint for day-7 trial ending emails.
 * Protect with CRON_SECRET (Authorization: Bearer … or ?secret=).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    const url = new URL(req.url);
    const ok =
      auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await sendTrialEndingReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}

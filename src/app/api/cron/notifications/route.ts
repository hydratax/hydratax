import { NextResponse } from "next/server";
import { sendFilingReminders } from "@/server/billing/filing-reminders";
import { checkR2StorageQuota } from "@/server/storage/r2-quota";

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

/** Manual/platform cron: filing reminders + R2 quota alerts. */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [filingReminders, r2Quota] = await Promise.all([
      sendFilingReminders(),
      checkR2StorageQuota(),
    ]);
    return NextResponse.json({ ok: true, filingReminders, r2Quota });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}

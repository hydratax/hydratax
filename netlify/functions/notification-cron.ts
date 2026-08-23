/**
 * Daily cron: filing reminder emails + R2 storage quota alerts.
 * Schedule: 09:00 UTC via netlify.toml
 */

import { sendFilingReminders } from "../../src/server/billing/filing-reminders";
import { checkR2StorageQuota } from "../../src/server/storage/r2-quota";

type NetlifyResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export default async function handler(): Promise<NetlifyResponse> {
  try {
    const [filingReminders, r2Quota] = await Promise.all([
      sendFilingReminders(),
      checkR2StorageQuota(),
    ]);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, filingReminders, r2Quota }),
    };
  } catch (err) {
    console.error("[notification-cron]", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}

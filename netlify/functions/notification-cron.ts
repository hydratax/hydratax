/**
 * Daily cron: filing reminder emails + R2 storage quota alerts + UK GDPR
 * data-retention clean-up (and due account deletions).
 * Schedule: 09:00 UTC via netlify.toml
 */

import { sendFilingReminders } from "../../src/server/billing/filing-reminders";
import { checkR2StorageQuota } from "../../src/server/storage/r2-quota";
import { runRetentionJobsBestEffort } from "../../src/server/privacy/retention";

type NetlifyResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export default async function handler(): Promise<NetlifyResponse> {
  // Never throws; counts / step names only (no personal data).
  const retention = await runRetentionJobsBestEffort();
  try {
    const [filingReminders, r2Quota] = await Promise.all([
      sendFilingReminders(),
      checkR2StorageQuota(),
    ]);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, filingReminders, r2Quota, retention }),
    };
  } catch (err) {
    console.error("[notification-cron]", err instanceof Error ? err.name : "error");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Cron job failed", retention }),
    };
  }
}

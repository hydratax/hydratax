/**
 * Daily cron: remind Practice desk trials ending within 24 hours (day 7).
 * Schedule: 09:00 UTC via netlify.toml
 */

import { sendTrialEndingReminders } from "../../src/server/billing/trial-reminders";

type NetlifyResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export default async function handler(): Promise<NetlifyResponse> {
  try {
    const result = await sendTrialEndingReminders();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, ...result }),
    };
  } catch (err) {
    console.error("[trial-reminders]", err);
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

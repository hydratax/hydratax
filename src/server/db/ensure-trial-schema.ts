import { neon } from "@neondatabase/serverless";
import { isMemoryStore } from "@/lib/env";

let ensured = false;

/** Ensure trial columns exist so free-trial billing never waits on a manual SQL paste. */
export async function ensureTrialSchema() {
  if (ensured || isMemoryStore()) return;
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = neon(url);
  await sql`
    ALTER TABLE practice_subscriptions
    ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz
  `;
  await sql`
    ALTER TABLE practice_subscriptions
    ADD COLUMN IF NOT EXISTS trial_reminder_sent_at timestamptz
  `;
  ensured = true;
}

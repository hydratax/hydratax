import { isSupabaseConfigured } from "@/lib/env";

const DEFAULT_LIMIT_GB = 10;
const ALERT_THRESHOLDS = [80, 90, 95] as const;

export type R2QuotaStatus = {
  bytesUsed: number;
  bytesLimit: number;
  percentUsed: number;
  documentCount: number;
};

export function r2StorageLimitBytes(): number {
  const gb = Number(process.env.R2_STORAGE_LIMIT_GB ?? DEFAULT_LIMIT_GB);
  if (!Number.isFinite(gb) || gb <= 0) {
    return DEFAULT_LIMIT_GB * 1_073_741_824;
  }
  return Math.round(gb * 1_073_741_824);
}

export async function getR2StorageUsage(): Promise<R2QuotaStatus | null> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("client_documents")
    .select("size_bytes");
  if (error) {
    console.warn("[r2-quota] query failed", error.message);
    return null;
  }
  const rows = data ?? [];
  const bytesUsed = rows.reduce(
    (sum, row) => sum + Number(row.size_bytes ?? 0),
    0,
  );
  const bytesLimit = r2StorageLimitBytes();
  return {
    bytesUsed,
    bytesLimit,
    percentUsed: bytesLimit > 0 ? (bytesUsed / bytesLimit) * 100 : 0,
    documentCount: rows.length,
  };
}

export type R2QuotaAlertResult = {
  checked: boolean;
  bytesUsed: number;
  bytesLimit: number;
  percentUsed: number;
  alertsSent: number;
  skipped: string[];
};

async function lastAlertThreshold(): Promise<number | null> {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("platform_storage_alerts")
    .select("threshold_pct")
    .eq("alert_type", "r2_quota")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.threshold_pct ?? null;
}

async function recordAlert(
  thresholdPct: number,
  bytesUsed: number,
  bytesLimit: number,
) {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const supabase = getSupabaseAdmin();
  await supabase.from("platform_storage_alerts").insert({
    alert_type: "r2_quota",
    threshold_pct: thresholdPct,
    bytes_used: bytesUsed,
    bytes_limit: bytesLimit,
  });
}

/** Notify platform admins when R2 usage crosses 80/90/95% thresholds. */
export async function checkR2StorageQuota(): Promise<R2QuotaAlertResult> {
  const result: R2QuotaAlertResult = {
    checked: false,
    bytesUsed: 0,
    bytesLimit: r2StorageLimitBytes(),
    percentUsed: 0,
    alertsSent: 0,
    skipped: [],
  };

  const usage = await getR2StorageUsage();
  if (!usage) {
    result.skipped.push("storage_usage_unavailable");
    return result;
  }

  result.checked = true;
  result.bytesUsed = usage.bytesUsed;
  result.bytesLimit = usage.bytesLimit;
  result.percentUsed = usage.percentUsed;

  const { platformAdminEmails } = await import("@/server/auth/admin");
  const admins = platformAdminEmails();
  if (!admins.length) {
    result.skipped.push("no_admin_emails");
    return result;
  }

  const pct = usage.percentUsed;
  const crossed = ALERT_THRESHOLDS.filter((t) => pct >= t);
  if (!crossed.length) return result;

  const highest = crossed[crossed.length - 1]!;
  const lastSent = await lastAlertThreshold();
  if (lastSent != null && lastSent >= highest) {
    result.skipped.push(`already_alerted_at_${lastSent}%`);
    return result;
  }

  const { getEnv } = await import("@/lib/env");
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const { sendTransactionalEmail } = await import("@/server/email/transactional");
  const { r2QuotaAlertEmailContent } = await import(
    "@/server/email/filing-reminder-template"
  );
  const content = r2QuotaAlertEmailContent({
    bytesUsed: usage.bytesUsed,
    bytesLimit: usage.bytesLimit,
    thresholdPct: highest,
    appUrl,
  });

  for (const email of admins) {
    await sendTransactionalEmail({
      to: email,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  }

  await recordAlert(highest, usage.bytesUsed, usage.bytesLimit);
  result.alertsSent = admins.length;
  return result;
}

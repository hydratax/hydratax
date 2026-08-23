import type { PracticeFilingRow } from "@/lib/practice-filings";
import { filingKindLabel } from "@/lib/practice-filings";

export type FilingReminderEmailItem = {
  companyName: string;
  companyNumber: string | null;
  label: string;
  periodLabel: string;
  deadlineLabel: string;
  daysBadge: string;
  urgency: "overdue" | "due_soon" | "ok";
  actionUrl: string;
  actionLabel: string;
};

function daysBetween(dueIso: string | null, now = new Date()) {
  if (!dueIso) return null;
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);
}

export function filingRowToEmailItem(
  row: PracticeFilingRow,
  appUrl: string,
): FilingReminderEmailItem {
  const d = row.deadlineIso ? daysBetween(row.deadlineIso) : null;
  let daysBadge = row.daysLabel.toUpperCase();
  if (d != null && d < 0) {
    daysBadge = `${Math.abs(d)} DAY${Math.abs(d) === 1 ? "" : "S"} OVER`;
  } else if (d != null && d >= 0) {
    daysBadge = `${d} DAY${d === 1 ? "" : "S"} LEFT`;
  }

  const urgency =
    row.urgency === "overdue" || row.urgency === "due_soon"
      ? row.urgency
      : "ok";

  return {
    companyName: row.companyName,
    companyNumber: row.companyNumber,
    label: filingKindLabel(row.kind),
    periodLabel: row.periodLabel,
    deadlineLabel: row.deadlineLabel,
    daysBadge,
    urgency,
    actionUrl: `${appUrl.replace(/\/$/, "")}${row.href}`,
    actionLabel: row.urgency === "overdue" ? "Resume" : "View & file",
  };
}

function badgeColor(urgency: FilingReminderEmailItem["urgency"]) {
  if (urgency === "overdue") return "#dc2626";
  return "#15803d";
}

function filingTypeColor(urgency: FilingReminderEmailItem["urgency"]) {
  if (urgency === "overdue") return "#f97316";
  return "#4ade80";
}

function renderFilingRow(item: FilingReminderEmailItem) {
  const coLine = item.companyNumber
    ? `${item.companyName} ${item.companyNumber}`
    : item.companyName;
  return `
  <tr>
    <td style="padding:16px 0;border-bottom:1px solid #333;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="88" valign="top" style="padding-right:12px;">
            <div style="background:${badgeColor(item.urgency)};color:#fff;font-size:11px;font-weight:700;line-height:1.25;padding:10px 8px;text-align:center;border-radius:4px;min-height:52px;display:flex;align-items:center;justify-content:center;">
              ${item.daysBadge}
            </div>
          </td>
          <td valign="top" style="color:#e5e7eb;">
            <div style="font-size:15px;font-weight:700;color:#fff;">${coLine}</div>
            <div style="font-size:14px;font-weight:600;color:${filingTypeColor(item.urgency)};margin-top:4px;">${item.label}</div>
            <div style="font-size:13px;color:#9ca3af;margin-top:6px;">${item.periodLabel}</div>
            <div style="font-size:13px;color:#9ca3af;">${item.urgency === "overdue" ? "Was due" : "Due"} ${item.deadlineLabel}</div>
          </td>
          <td width="120" valign="top" align="right" style="padding-left:12px;">
            <a href="${item.actionUrl}" style="display:inline-block;background:#15803d;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px;font-size:13px;font-weight:600;">${item.actionLabel}</a>
            <div style="margin-top:8px;"><a href="${item.actionUrl}" style="color:#9ca3af;font-size:12px;">Filed elsewhere?</a></div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function filingReminderEmailContent(opts: {
  recipientName: string;
  practiceName: string;
  items: FilingReminderEmailItem[];
  appUrl: string;
  unsubscribeUrl: string;
}) {
  const overdue = opts.items.filter((i) => i.urgency === "overdue").length;
  const dueSoon = opts.items.filter((i) => i.urgency === "due_soon").length;
  const total = opts.items.length;
  const subject =
    overdue > 0
      ? `${overdue} overdue — ${total} filing${total === 1 ? "" : "s"} due`
      : `${total} filing${total === 1 ? "" : "s"} due soon`;

  const intro =
    total === 1
      ? `You have 1 filing due across your practice — most urgent first:`
      : `You have ${total} filings due across ${opts.practiceName} — most urgent first:`;

  const rowsHtml = opts.items.map(renderFilingRow).join("");

  const text = `Hi ${opts.recipientName},

${intro}

${opts.items
  .map(
    (i) =>
      `• ${i.companyName} — ${i.label} (${i.daysBadge}) — ${i.actionUrl}`,
  )
  .join("\n")}

We send one summary like this about once a month while you have filings outstanding — and more often in the final week before a deadline.

Unsubscribe: ${opts.unsubscribeUrl}

— HydraTax
`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#111827;font-family:Georgia,serif;">
  <div style="max-width:640px;margin:0 auto;">
    <p style="color:#9ca3af;font-size:13px;margin:0 0 12px;">${
      overdue > 0 ? `${overdue} overdue` : "Upcoming"
    } — ${total} filing${total === 1 ? "" : "s"} due${
      dueSoon && !overdue ? " soon" : ""
    }</p>
    <div style="background:#1f2937;border-radius:12px;padding:24px;color:#e5e7eb;">
      <h1 style="margin:0 0 16px;font-size:28px;color:#fff;font-weight:700;">Filing Reminders</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">Hi ${opts.recipientName},</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${intro}</p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        ${rowsHtml}
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
        We send one summary like this about once a month while you have filings outstanding — and more often in the final week before a deadline, so nothing slips by. You can turn these off any time using the link below.
      </p>
      <p style="margin:16px 0 0;font-size:13px;color:#9ca3af;">
        Also available with HydraTax: Self Assessment, payroll, VAT, and bank categorisation.
        <a href="${opts.appUrl}/pricing" style="color:#4ade80;">See what we offer</a>.
      </p>
      <p style="margin:20px 0 0;font-size:13px;">
        <a href="${opts.unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe from filing reminders</a>
      </p>
      <p style="margin:24px 0 0;color:#fff;">Best regards,<br/>HydraTax</p>
    </div>
    <p style="text-align:center;margin-top:16px;font-size:12px;color:#6b7280;">
      <a href="${opts.appUrl}/dashboard" style="color:#4ade80;">Open practice desk</a>
    </p>
  </div>
</body></html>`;

  return { subject, text, html };
}

export function customAdminEmailContent(opts: {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  unsubscribeUrl?: string;
}) {
  const footer = opts.unsubscribeUrl
    ? `<p style="margin-top:24px;font-size:13px;"><a href="${opts.unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a></p>`
    : "";
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#111827;font-family:Georgia,serif;">
  <div style="max-width:640px;margin:0 auto;background:#1f2937;border-radius:12px;padding:24px;color:#e5e7eb;">
    <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#4ade80;font-weight:700;margin:0 0 16px;">HydraTax</p>
    <div style="font-size:15px;line-height:1.6;">${opts.bodyHtml}</div>
    ${footer}
  </div>
</body></html>`;
  const text = `${opts.bodyText}${
    opts.unsubscribeUrl ? `\n\nUnsubscribe: ${opts.unsubscribeUrl}` : ""
  }`;
  return { subject: opts.subject, text, html };
}

export function r2QuotaAlertEmailContent(opts: {
  bytesUsed: number;
  bytesLimit: number;
  thresholdPct: number;
  appUrl: string;
}) {
  const usedGb = (opts.bytesUsed / 1_073_741_824).toFixed(2);
  const limitGb = (opts.bytesLimit / 1_073_741_824).toFixed(1);
  const pct = Math.round((opts.bytesUsed / opts.bytesLimit) * 100);
  const subject = `HydraTax R2 storage at ${pct}% (${usedGb} GB of ${limitGb} GB)`;
  const text = `HydraTax document storage (Cloudflare R2) is at ${pct}% of your ${limitGb} GB limit.

Used: ${usedGb} GB
Limit: ${limitGb} GB
Alert threshold: ${opts.thresholdPct}%

Review uploads in the admin desk or delete old client documents to free space.

— HydraTax
`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#dc2626;font-weight:700;">Storage alert</p>
  <h1 style="font-size:24px;">R2 bucket at ${pct}% capacity</h1>
  <p>Document storage is approaching your <strong>${limitGb} GB</strong> Cloudflare R2 limit.</p>
  <ul>
    <li><strong>Used:</strong> ${usedGb} GB</li>
    <li><strong>Limit:</strong> ${limitGb} GB</li>
    <li><strong>Threshold:</strong> ${opts.thresholdPct}%</li>
  </ul>
  <p>Delete unused client documents or upgrade your R2 plan before uploads fail.</p>
  <p><a href="${opts.appUrl}/admin" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open admin</a></p>
</body></html>`;
  return { subject, text, html };
}

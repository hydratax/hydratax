function formatPeriod(start: string, end: string) {
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function ct600SubmitEmailContent(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  periodStart: string;
  periodEnd: string;
  accepted: boolean;
  correlationId?: string | null;
  errorMessage?: string | null;
  demo?: boolean;
  clientId: string;
  appUrl: string;
}) {
  const period = formatPeriod(opts.periodStart, opts.periodEnd);
  const deskUrl = `${opts.appUrl}/clients/${opts.clientId}/corporation-tax`;
  const statusLabel = opts.accepted ? "accepted by HMRC" : "not accepted";
  const subject = opts.accepted
    ? `CT600 accepted — ${opts.companyName} (${period})`
    : `CT600 submission failed — ${opts.companyName} (${period})`;

  const demoNote = opts.demo
    ? "\nThis was a demo submission — no return was sent to HMRC.\n"
    : "";

  const correlationBlock = opts.correlationId
    ? `\nHMRC correlation ID: ${opts.correlationId}\n`
    : "";

  const errorBlock =
    !opts.accepted && opts.errorMessage
      ? `\nReason: ${opts.errorMessage}\n`
      : "";

  const text = `Your Corporation Tax return (CT600) for ${opts.companyName} has been ${statusLabel}.

Company: ${opts.companyName}
Company number: ${opts.companyNumber}
UTR: ${opts.utr}
Period: ${period}${demoNote}${correlationBlock}${errorBlock}
Open the client desk to review the return record and audit trail:
${deskUrl}

— HydraTax
${opts.appUrl}`;

  const statusColour = opts.accepted ? "#0f766e" : "#b91c1c";
  const statusHeading = opts.accepted
    ? "Corporation Tax return accepted"
    : "Corporation Tax return not accepted";

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:26px;margin:8px 0 16px;color:${statusColour};">${statusHeading}</h1>
  <p>CT600 for <strong>${opts.companyName}</strong> (${period}) has been <strong>${statusLabel}</strong>.</p>
  <table style="font-size:14px;color:#3a4248;margin:16px 0;border-collapse:collapse;">
    <tr><td style="padding:4px 12px 4px 0;">Company number</td><td><strong>${opts.companyNumber}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;">UTR</td><td><strong>${opts.utr}</strong></td></tr>
    ${opts.correlationId ? `<tr><td style="padding:4px 12px 4px 0;">Correlation ID</td><td><strong>${opts.correlationId}</strong></td></tr>` : ""}
  </table>
  ${opts.demo ? `<p style="font-size:14px;color:#3a4248;">Demo mode — no return was sent to HMRC.</p>` : ""}
  ${!opts.accepted && opts.errorMessage ? `<p style="font-size:14px;color:#b91c1c;">${opts.errorMessage}</p>` : ""}
  <p style="margin-top:24px;"><a href="${deskUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Open Corporation Tax desk</a></p>
</body></html>`;

  return { subject, text, html };
}

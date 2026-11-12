import { sendTransactionalEmail } from "@/server/email/transactional";

/**
 * Email a Stripe invoice / receipt link after a successful charge
 * (subscription renewal, trial end, or one-off purchase).
 */
export async function sendPurchaseInvoiceEmail(input: {
  to: string;
  amountLabel: string;
  description: string;
  invoiceNumber?: string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  oneTime?: boolean;
}): Promise<"resend" | "logged" | "skipped"> {
  const to = input.to?.trim();
  if (!to?.includes("@")) return "skipped";

  const kind = input.oneTime ? "Purchase receipt" : "Subscription invoice";
  const subject = `HydraTax ${kind} — ${input.amountLabel}`;
  const links: string[] = [];
  if (input.hostedInvoiceUrl) {
    links.push(`View invoice: ${input.hostedInvoiceUrl}`);
  }
  if (input.invoicePdfUrl) {
    links.push(`Download PDF: ${input.invoicePdfUrl}`);
  }

  const text = `Hi,

Thank you for your HydraTax payment.

${input.description}
Amount: ${input.amountLabel}
${input.invoiceNumber ? `Invoice: ${input.invoiceNumber}` : ""}

${links.join("\n")}

Manage billing anytime: ${(process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.uk").replace(/\/$/, "")}/settings/account

— HydraTax
`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:Georgia,serif;color:#0a0a0a;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">HydraTax</p>
  <h1 style="font-size:24px;margin:8px 0 16px;">${escapeHtml(kind)}</h1>
  <p>${escapeHtml(input.description)}</p>
  <p><strong>Amount:</strong> ${escapeHtml(input.amountLabel)}</p>
  ${input.invoiceNumber ? `<p><strong>Invoice:</strong> ${escapeHtml(input.invoiceNumber)}</p>` : ""}
  <p style="margin-top:24px;">
    ${input.hostedInvoiceUrl ? `<a href="${escapeAttr(input.hostedInvoiceUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;margin-right:8px;">View invoice</a>` : ""}
    ${input.invoicePdfUrl ? `<a href="${escapeAttr(input.invoicePdfUrl)}" style="display:inline-block;border:1px solid #0f766e;color:#0f766e;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Download PDF</a>` : ""}
  </p>
  <p style="margin-top:24px;color:#3a4248;font-size:14px;">Update your card or cancel from <a href="${(process.env.NEXT_PUBLIC_APP_URL ?? "https://hydratax.uk").replace(/\/$/, "")}/settings/account">Account settings</a>.</p>
</body></html>`;

  return sendTransactionalEmail({ to, subject, text, html });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

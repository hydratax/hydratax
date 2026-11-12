import type { PracticeLetterhead } from "@/lib/desk-profile";
import { letterheadNeedsBranding } from "@/lib/invoices/totals";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gbp(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export type InvoiceRenderLine = {
  description: string;
  quantity: number;
  unitPricePence: number;
  vatRateBps: number;
  lineNetPence: number;
};

export type InvoiceRenderModel = {
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string;
  reference?: string | null;
  notes?: string | null;
  paymentInstructions?: string | null;
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  lines: InvoiceRenderLine[];
};

export type InvoiceClientModel = {
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  companyNumber?: string | null;
};

/**
 * Standalone A4 invoice HTML for print / email.
 * Shows blank logo / address slots when branding is incomplete, with a
 * screen-only CTA to Practice branding (never leaks other practices' data —
 * letterhead is always the caller's practice).
 */
export function renderInvoiceHtml(input: {
  letterhead: PracticeLetterhead;
  invoice: InvoiceRenderModel;
  client: InvoiceClientModel;
  brandingSettingsHref?: string;
  autoPrint?: boolean;
}): string {
  const lh = input.letterhead;
  const inv = input.invoice;
  const client = input.client;
  const needsBranding = letterheadNeedsBranding(lh);
  const brandingHref = input.brandingSettingsHref ?? "/settings/letterhead";

  const contact = [lh.phone, lh.email, lh.website].filter(Boolean).join(" · ");
  const address = (lh.addressLines ?? [])
    .filter(Boolean)
    .map((l) => escapeHtml(l))
    .join("<br/>");
  const footer = (lh.footerLines ?? [])
    .filter(Boolean)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("");

  const logo = lh.logoUrl?.trim()
    ? `<img src="${escapeHtml(lh.logoUrl)}" alt="" class="logo" />`
    : `<div class="logo-slot" aria-hidden="true">Logo</div>`;

  const practiceName = lh.practiceName?.trim()
    ? escapeHtml(lh.practiceName)
    : `<span class="placeholder">Practice name</span>`;

  const addressBlock = address
    ? `<p class="meta">${address}</p>`
    : `<p class="meta placeholder">Address not set</p>`;

  const contactBlock = contact
    ? `<p class="meta">${escapeHtml(contact)}</p>`
    : `<p class="meta placeholder">Phone · email · website</p>`;

  const qual = lh.qualification
    ? `<p class="qual">${escapeHtml(lh.qualification)}</p>`
    : "";

  const brandingBanner = needsBranding
    ? `<div class="branding-hint print-hide">
        <strong>Personalise this invoice.</strong>
        Add your logo, address and bank details so clients see a professional practice face.
        <a href="${escapeHtml(brandingHref)}">Open Practice branding →</a>
      </div>`
    : "";

  const linesHtml = inv.lines
    .map(
      (line) => `<tr>
      <td>${escapeHtml(line.description)}</td>
      <td class="num">${line.quantity}</td>
      <td class="num mono">${escapeHtml(gbp(line.unitPricePence))}</td>
      <td class="num">${(line.vatRateBps / 100).toFixed(0)}%</td>
      <td class="num mono">${escapeHtml(gbp(line.lineNetPence))}</td>
    </tr>`,
    )
    .join("");

  const notes = inv.notes?.trim()
    ? `<section class="block">
        <h2>Notes</h2>
        <p class="pre">${escapeHtml(inv.notes)}</p>
      </section>`
    : "";

  const payment = inv.paymentInstructions?.trim()
    ? `<section class="block">
        <h2>Payment instructions</h2>
        <p class="pre">${escapeHtml(inv.paymentInstructions)}</p>
      </section>`
    : "";

  const autoPrint = input.autoPrint
    ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},200)});</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>Invoice ${escapeHtml(inv.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1a1a1a;
      font-family: "Segoe UI", Calibri, "Helvetica Neue", Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.4;
      background: #fff;
    }
    .sheet { max-width: 190mm; margin: 0 auto; }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 0.5rem;
      align-items: center; justify-content: space-between;
      margin-bottom: 1rem; padding: 0.75rem 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 0.875rem; color: #6b7280;
    }
    .toolbar button {
      background: #0f766e; color: #fff; border: 0;
      border-radius: 0.4rem; padding: 0.5rem 0.9rem;
      font-weight: 600; cursor: pointer;
    }
    .branding-hint {
      margin: 0 0 14pt;
      padding: 10pt 12pt;
      border: 1px solid #99f6e4;
      background: #f0fdfa;
      border-radius: 8px;
      font-size: 9.5pt;
      color: #134e4a;
    }
    .branding-hint a { color: #0f766e; font-weight: 700; margin-left: 0.35rem; }
    .header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16pt;
      border-bottom: 1.5px solid #0f766e;
      padding-bottom: 12pt;
      margin-bottom: 16pt;
      align-items: start;
    }
    .logo { max-height: 52px; max-width: 180px; object-fit: contain; display: block; margin-bottom: 6pt; }
    .logo-slot {
      width: 120px; height: 48px; margin-bottom: 6pt;
      border: 1px dashed #cbd5e1; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      color: #94a3b8; font-size: 9pt; font-weight: 600;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .practice {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 15pt; font-weight: 600; margin: 0 0 2pt; color: #111;
    }
    .qual { margin: 0 0 4pt; font-size: 9pt; font-weight: 600; color: #0f766e; }
    .meta { margin: 0 0 2pt; font-size: 9.5pt; color: #4b5563; }
    .placeholder { color: #94a3b8; font-style: italic; }
    .inv-meta { text-align: right; }
    .inv-meta .label {
      font-size: 9pt; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: #0f766e; margin: 0;
    }
    .inv-meta h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 22pt; margin: 2pt 0 6pt; font-weight: 600;
    }
    .inv-meta p { margin: 0 0 2pt; font-size: 9.5pt; color: #4b5563; }
    .parties {
      display: grid; grid-template-columns: 1fr 1fr; gap: 18pt;
      margin-bottom: 16pt;
    }
    .parties h2 {
      margin: 0 0 4pt; font-size: 8.5pt; font-weight: 700;
      letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280;
    }
    .parties .name { margin: 0 0 2pt; font-weight: 700; font-size: 11pt; }
    .parties p { margin: 0 0 1pt; font-size: 9.5pt; color: #4b5563; }
    table.lines {
      width: 100%; border-collapse: collapse; margin-top: 4pt;
      font-size: 9.5pt;
    }
    table.lines th {
      text-align: left; padding: 7pt 6pt;
      border-bottom: 1.5px solid #0f766e;
      font-size: 8.5pt; letter-spacing: 0.06em; text-transform: uppercase;
      color: #374151;
    }
    table.lines th.num, table.lines td.num { text-align: right; }
    table.lines td {
      padding: 7pt 6pt; border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .totals {
      margin-left: auto; margin-top: 12pt; width: 220px;
      font-size: 10pt;
    }
    .totals .row {
      display: flex; justify-content: space-between; gap: 12pt;
      padding: 3pt 0;
    }
    .totals .row span:first-child { color: #6b7280; }
    .totals .grand {
      margin-top: 4pt; padding-top: 6pt;
      border-top: 1.5px solid #111; font-weight: 700; font-size: 11pt;
    }
    .block { margin-top: 16pt; }
    .block h2 {
      margin: 0 0 4pt; font-size: 8.5pt; font-weight: 700;
      letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280;
    }
    .pre { margin: 0; white-space: pre-wrap; font-size: 9.5pt; color: #374151; }
    .footer {
      margin-top: 24pt; padding-top: 10pt;
      border-top: 1px solid #d1d5db; font-size: 8pt; color: #6b7280;
    }
    .footer p { margin: 0 0 2pt; }
    @media print {
      .print-hide, .toolbar { display: none !important; }
      body { background: #fff; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="toolbar print-hide">
      <span>Invoice ${escapeHtml(inv.invoiceNumber)} · use Print to save as PDF</span>
      <button type="button" onclick="window.print()">Print / PDF</button>
    </div>
    ${brandingBanner}
    <header class="header">
      <div>
        ${logo}
        <p class="practice">${practiceName}</p>
        ${qual}
        ${addressBlock}
        ${contactBlock}
      </div>
      <div class="inv-meta">
        <p class="label">Invoice</p>
        <h1>${escapeHtml(inv.invoiceNumber)}</h1>
        <p>Status: ${escapeHtml(inv.status)}${inv.reference ? ` · Ref ${escapeHtml(inv.reference)}` : ""}</p>
        <p>Issue date: ${escapeHtml(inv.issueDate)}</p>
        <p>Due date: ${escapeHtml(inv.dueDate)}</p>
      </div>
    </header>
    <div class="parties">
      <div>
        <h2>Bill to</h2>
        <p class="name">${escapeHtml(client.name)}</p>
        ${client.contactEmail ? `<p>${escapeHtml(client.contactEmail)}</p>` : ""}
        ${client.contactPhone ? `<p>${escapeHtml(client.contactPhone)}</p>` : ""}
        ${client.companyNumber ? `<p>Company no. ${escapeHtml(client.companyNumber)}</p>` : ""}
      </div>
      <div>
        <h2>From</h2>
        <p class="name">${practiceName}</p>
        ${addressBlock}
      </div>
    </div>
    <table class="lines">
      <thead>
        <tr>
          <th>Description</th>
          <th class="num">Qty</th>
          <th class="num">Unit</th>
          <th class="num">VAT</th>
          <th class="num">Net</th>
        </tr>
      </thead>
      <tbody>${linesHtml}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Net</span><span class="mono">${escapeHtml(gbp(inv.subtotalPence))}</span></div>
      <div class="row"><span>VAT</span><span class="mono">${escapeHtml(gbp(inv.vatPence))}</span></div>
      <div class="row grand"><span>Total due</span><span class="mono">${escapeHtml(gbp(inv.totalPence))}</span></div>
    </div>
    ${notes}
    ${payment}
    ${footer ? `<footer class="footer">${footer}</footer>` : `<footer class="footer"><p class="placeholder">Footer / regulatory lines — add in Practice branding</p></footer>`}
  </div>
  ${autoPrint}
</body>
</html>`;
}

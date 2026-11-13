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

function formatUkDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
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
    : `<p class="meta placeholder">Address not set — add in Practice branding</p>`;

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
      <td class="num">${escapeHtml(gbp(line.unitPricePence))}</td>
      <td class="num">${(line.vatRateBps / 100).toFixed(0)}%</td>
      <td class="num">${escapeHtml(gbp(line.lineNetPence))}</td>
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
    ? `<section class="block payment">
        <h2>Payment instructions</h2>
        <p class="pre">${escapeHtml(inv.paymentInstructions)}</p>
      </section>`
    : needsBranding
      ? `<section class="block payment print-hide">
        <h2>Payment instructions</h2>
        <p class="meta placeholder">Add bank details in <a href="${escapeHtml(brandingHref)}">Practice branding</a>.</p>
      </section>`
      : "";

  const autoPrint = input.autoPrint
    ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},200)});</script>`
    : "";

  const statusLabel = escapeHtml(inv.status.replace(/_/g, " "));

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>Invoice ${escapeHtml(inv.invoiceNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Libre+Baskerville:wght@400;700&display=swap" rel="stylesheet"/>
  <style>
    @page { size: A4; margin: 14mm 12mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1c1917;
      font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      font-size: 10pt;
      line-height: 1.45;
      background: #f5f5f4;
    }
    .sheet {
      max-width: 190mm;
      margin: 0 auto;
      padding: 10mm 9mm 12mm;
      background: #fff;
      box-shadow: 0 1px 3px rgba(28, 25, 23, 0.08);
    }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 0.5rem;
      align-items: center; justify-content: space-between;
      margin: 0 auto 12pt; max-width: 190mm;
      padding: 0 2mm;
      font-size: 0.875rem; color: #78716c;
    }
    .toolbar button {
      background: #0f766e; color: #fff; border: 0;
      border-radius: 0.4rem; padding: 0.5rem 0.9rem;
      font-family: inherit; font-weight: 600; cursor: pointer;
    }
    .branding-hint {
      margin: 0 0 14pt;
      padding: 10pt 12pt;
      border: 1px solid #99f6e4;
      background: #f0fdfa;
      border-radius: 8px;
      font-size: 9pt;
      color: #134e4a;
    }
    .branding-hint a { color: #0f766e; font-weight: 700; margin-left: 0.35rem; }
    .accent {
      height: 4px;
      background: linear-gradient(90deg, #0f766e 0%, #14b8a6 55%, #99f6e4 100%);
      border-radius: 2px;
      margin-bottom: 16pt;
    }
    .header {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 18pt;
      padding-bottom: 14pt;
      margin-bottom: 14pt;
      border-bottom: 1px solid #e7e5e4;
      align-items: start;
    }
    .logo { max-height: 56px; max-width: 200px; object-fit: contain; display: block; margin-bottom: 8pt; }
    .logo-slot {
      width: 128px; height: 52px; margin-bottom: 8pt;
      border: 1px dashed #d6d3d1; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      color: #a8a29e; font-size: 8.5pt; font-weight: 600;
      letter-spacing: 0.06em; text-transform: uppercase;
    }
    .practice {
      font-family: "Libre Baskerville", Georgia, serif;
      font-size: 16pt; font-weight: 700; margin: 0 0 3pt; color: #1c1917;
      letter-spacing: -0.01em;
    }
    .qual { margin: 0 0 5pt; font-size: 8.5pt; font-weight: 600; color: #0f766e; }
    .meta { margin: 0 0 2pt; font-size: 9pt; color: #57534e; }
    .placeholder { color: #a8a29e; font-style: italic; }
    .inv-meta { text-align: right; }
    .inv-meta .label {
      font-size: 8pt; font-weight: 700; letter-spacing: 0.14em;
      text-transform: uppercase; color: #0f766e; margin: 0 0 4pt;
    }
    .inv-meta h1 {
      font-family: "Libre Baskerville", Georgia, serif;
      font-size: 18pt; margin: 0 0 10pt; font-weight: 700;
      color: #1c1917; letter-spacing: -0.02em;
    }
    .inv-meta .facts {
      display: inline-grid;
      grid-template-columns: auto auto;
      gap: 4pt 10pt;
      text-align: left;
      font-size: 9pt;
      color: #57534e;
    }
    .inv-meta .facts dt { font-weight: 600; color: #78716c; }
    .inv-meta .facts dd { margin: 0; color: #1c1917; font-variant-numeric: tabular-nums; }
    .status-pill {
      display: inline-block; margin-bottom: 8pt;
      padding: 2pt 8pt; border-radius: 999px;
      background: #ecfdf5; color: #0f766e;
      font-size: 8pt; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .parties {
      display: grid; grid-template-columns: 1fr 1fr; gap: 18pt;
      margin-bottom: 18pt;
    }
    .parties h2 {
      margin: 0 0 6pt; font-size: 8pt; font-weight: 700;
      letter-spacing: 0.12em; text-transform: uppercase; color: #78716c;
    }
    .parties .name {
      margin: 0 0 3pt;
      font-family: "Libre Baskerville", Georgia, serif;
      font-weight: 700; font-size: 11.5pt; color: #1c1917;
    }
    .parties p { margin: 0 0 1pt; font-size: 9pt; color: #57534e; }
    table.lines {
      width: 100%; border-collapse: collapse; margin-top: 2pt;
      font-size: 9.5pt;
    }
    table.lines th {
      text-align: left; padding: 8pt 6pt;
      border-bottom: 2px solid #0f766e;
      font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase;
      color: #44403c; font-weight: 700;
      background: #fafaf9;
    }
    table.lines th.num, table.lines td.num {
      text-align: right; font-variant-numeric: tabular-nums;
    }
    table.lines td {
      padding: 9pt 6pt; border-bottom: 1px solid #e7e5e4;
      vertical-align: top; color: #292524;
    }
    table.lines tbody tr:last-child td { border-bottom: 1px solid #d6d3d1; }
    .totals-wrap {
      display: flex; justify-content: flex-end; margin-top: 14pt;
    }
    .totals {
      width: 240px;
      padding: 10pt 12pt;
      background: #fafaf9;
      border: 1px solid #e7e5e4;
      border-radius: 8px;
      font-size: 10pt;
    }
    .totals .row {
      display: flex; justify-content: space-between; gap: 12pt;
      padding: 3pt 0; color: #57534e;
    }
    .totals .row span:last-child {
      color: #1c1917; font-variant-numeric: tabular-nums; font-weight: 500;
    }
    .totals .grand {
      margin-top: 6pt; padding-top: 8pt;
      border-top: 1.5px solid #0f766e;
      font-weight: 700; font-size: 12pt; color: #1c1917;
    }
    .totals .grand span:first-child {
      font-family: "Libre Baskerville", Georgia, serif;
      font-size: 11pt;
    }
    .block { margin-top: 18pt; }
    .block h2 {
      margin: 0 0 5pt; font-size: 8pt; font-weight: 700;
      letter-spacing: 0.12em; text-transform: uppercase; color: #78716c;
    }
    .payment {
      padding: 10pt 12pt;
      background: #f0fdfa;
      border: 1px solid #ccfbf1;
      border-radius: 8px;
    }
    .pre { margin: 0; white-space: pre-wrap; font-size: 9.5pt; color: #44403c; }
    .footer {
      margin-top: 28pt; padding-top: 10pt;
      border-top: 1px solid #e7e5e4; font-size: 8pt; color: #78716c;
    }
    .footer p { margin: 0 0 2pt; }
    @media print {
      .print-hide, .toolbar { display: none !important; }
      body { background: #fff; }
      .sheet { box-shadow: none; padding: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar print-hide">
    <span>Invoice ${escapeHtml(inv.invoiceNumber)} · use Print to save as PDF</span>
    <button type="button" onclick="window.print()">Print / PDF</button>
  </div>
  <div class="sheet">
    ${brandingBanner}
    <div class="accent" aria-hidden="true"></div>
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
        <span class="status-pill">${statusLabel}</span>
        <dl class="facts">
          <dt>Issued</dt><dd>${escapeHtml(formatUkDate(inv.issueDate))}</dd>
          <dt>Due</dt><dd>${escapeHtml(formatUkDate(inv.dueDate))}</dd>
          ${inv.reference ? `<dt>Ref</dt><dd>${escapeHtml(inv.reference)}</dd>` : ""}
        </dl>
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
    <div class="totals-wrap">
      <div class="totals">
        <div class="row"><span>Net</span><span>${escapeHtml(gbp(inv.subtotalPence))}</span></div>
        <div class="row"><span>VAT</span><span>${escapeHtml(gbp(inv.vatPence))}</span></div>
        <div class="row grand"><span>Total due</span><span>${escapeHtml(gbp(inv.totalPence))}</span></div>
      </div>
    </div>
    ${notes}
    ${payment}
    ${footer ? `<footer class="footer">${footer}</footer>` : `<footer class="footer"><p class="placeholder">Footer / regulatory lines — add in Practice branding</p></footer>`}
  </div>
  ${autoPrint}
</body>
</html>`;
}

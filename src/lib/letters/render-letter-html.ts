import type { PracticeLetterhead } from "@/lib/desk-profile";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Standalone A4 letter HTML for browser print / Save as PDF.
 * Practice letterhead header + letter body + footer — no app chrome.
 */
export function renderClientLetterHtml(input: {
  letterhead: PracticeLetterhead;
  title: string;
  body: string;
  clientName?: string;
  autoPrint?: boolean;
}): string {
  const lh = input.letterhead;
  const contact = [lh.phone, lh.email, lh.website].filter(Boolean).join(" · ");
  const address = lh.addressLines.map((l) => escapeHtml(l)).join("<br/>");
  const footer = lh.footerLines
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("");
  const logo = lh.logoUrl
    ? `<img src="${escapeHtml(lh.logoUrl)}" alt="" class="logo" />`
    : "";
  const qual = lh.qualification
    ? `<p class="qual">${escapeHtml(lh.qualification)}</p>`
    : "";
  const bodyHtml = escapeHtml(input.body).replace(/\n/g, "<br/>");
  const autoPrint = input.autoPrint
    ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},200)});</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(input.title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 20mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1a1a1a;
      font-family: "Segoe UI", Calibri, "Helvetica Neue", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      background: #fff;
    }
    .sheet { max-width: 190mm; margin: 0 auto; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      padding: 0.75rem 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 0.875rem;
      color: #6b7280;
    }
    .toolbar button {
      background: #0f766e;
      color: #fff;
      border: 0;
      border-radius: 0.4rem;
      padding: 0.5rem 0.9rem;
      font-weight: 600;
      cursor: pointer;
    }
    .header {
      border-bottom: 1.5px solid #0f766e;
      padding-bottom: 12pt;
      margin-bottom: 18pt;
    }
    .logo { max-height: 48px; margin-bottom: 8pt; object-fit: contain; }
    .practice {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 16pt;
      font-weight: 600;
      margin: 0 0 2pt;
      color: #111;
    }
    .qual { margin: 0 0 4pt; font-size: 9pt; font-weight: 600; color: #0f766e; }
    .meta { margin: 0; font-size: 9.5pt; color: #4b5563; }
    .body { white-space: normal; margin: 0; }
    .footer {
      margin-top: 28pt;
      padding-top: 10pt;
      border-top: 1px solid #d1d5db;
      font-size: 8.5pt;
      color: #6b7280;
    }
    .footer p { margin: 0 0 2pt; }
    @media print {
      .toolbar { display: none !important; }
      body { background: #fff; }
      .sheet { max-width: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="toolbar">
      <span>Finalised letter${input.clientName ? ` · ${escapeHtml(input.clientName)}` : ""} — use Save as PDF in the print dialog</span>
      <button type="button" onclick="window.print()">Print / Save PDF</button>
    </div>
    <header class="header">
      ${logo}
      <p class="practice">${escapeHtml(lh.practiceName || "Practice")}</p>
      ${qual}
      ${address ? `<p class="meta">${address}</p>` : ""}
      ${contact ? `<p class="meta">${escapeHtml(contact)}</p>` : ""}
    </header>
    <div class="body">${bodyHtml}</div>
    ${footer ? `<footer class="footer">${footer}</footer>` : ""}
  </div>
  ${autoPrint}
</body>
</html>`;
}

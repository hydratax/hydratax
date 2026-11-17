import type { PracticeLetterhead } from "@/lib/desk-profile";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUkLongDate(d = new Date()): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Standalone A4 letter HTML for browser print / Save as PDF.
 * Practice letterhead header + letter body + footer — no app chrome.
 *
 * @param logoSrc Absolute or data URL preferred. Relative `/api/...` works on
 *   the same-origin print route once branding images are served inline.
 */
export function renderClientLetterHtml(input: {
  letterhead: PracticeLetterhead;
  title: string;
  body: string;
  clientName?: string;
  /** Override date line (defaults to today). */
  letterDate?: string;
  autoPrint?: boolean;
  /** Absolute base for resolving relative logo URLs (e.g. https://hydratax.uk). */
  appOrigin?: string;
}): string {
  const lh = input.letterhead;
  const contact = [lh.phone, lh.email, lh.website].filter(Boolean).join(" · ");
  const address = (lh.addressLines ?? [])
    .filter(Boolean)
    .map((l) => escapeHtml(l))
    .join("<br/>");
  const footer = (lh.footerLines ?? [])
    .filter(Boolean)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("");

  let logoHref = (lh.logoUrl ?? "").trim();
  if (
    logoHref &&
    input.appOrigin &&
    logoHref.startsWith("/") &&
    !logoHref.startsWith("//")
  ) {
    logoHref = `${input.appOrigin.replace(/\/$/, "")}${logoHref}`;
  }
  const logo = logoHref
    ? `<img src="${escapeHtml(logoHref)}" alt="" class="logo" />`
    : "";

  const qual = lh.qualification
    ? `<p class="qual">${escapeHtml(lh.qualification)}</p>`
    : "";

  // Split body into paragraphs on blank lines for professional spacing.
  const paragraphs = input.body
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const lines = escapeHtml(block.trim()).replace(/\n/g, "<br/>");
      return `<p>${lines}</p>`;
    })
    .join("\n");

  const letterDate = escapeHtml(
    input.letterDate?.trim() || formatUkLongDate(),
  );

  const autoPrint = input.autoPrint
    ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},200)});</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(input.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Libre+Baskerville:wght@400;700&display=swap" rel="stylesheet"/>
  <style>
    @page { size: A4; margin: 16mm 14mm 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1c1917;
      font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      background: #f5f5f4;
    }
    .sheet {
      max-width: 190mm;
      margin: 0 auto;
      padding: 12mm 11mm 14mm;
      background: #fff;
      box-shadow: 0 1px 3px rgba(28, 25, 23, 0.08);
      min-height: 260mm;
      display: flex;
      flex-direction: column;
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
    .accent {
      height: 4px;
      background: linear-gradient(90deg, #0f766e 0%, #14b8a6 55%, #99f6e4 100%);
      border-radius: 2px;
      margin-bottom: 16pt;
    }
    .header {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 16pt;
      padding-bottom: 14pt;
      margin-bottom: 18pt;
      border-bottom: 1px solid #e7e5e4;
      align-items: start;
    }
    .logo {
      max-height: 56px; max-width: 200px;
      object-fit: contain; display: block; margin-bottom: 8pt;
    }
    .practice {
      font-family: "Libre Baskerville", Georgia, serif;
      font-size: 15pt; font-weight: 700; margin: 0 0 3pt; color: #1c1917;
      letter-spacing: -0.01em;
    }
    .qual { margin: 0 0 5pt; font-size: 8.5pt; font-weight: 600; color: #0f766e; }
    .meta { margin: 0 0 2pt; font-size: 9pt; color: #57534e; }
    .ref-meta { text-align: right; font-size: 9pt; color: #57534e; }
    .ref-meta .label {
      font-size: 8pt; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: #0f766e; margin: 0 0 6pt;
    }
    .ref-meta .date { margin: 0; color: #1c1917; font-variant-numeric: tabular-nums; }
    .ref-meta .title-line {
      margin: 8pt 0 0;
      font-family: "Libre Baskerville", Georgia, serif;
      font-size: 10.5pt; font-weight: 700; color: #1c1917;
    }
    .letter-body { flex: 1; }
    .letter-body p {
      margin: 0 0 11pt;
      color: #292524;
      font-size: 10.5pt;
      line-height: 1.55;
    }
    .letter-body p:last-child { margin-bottom: 0; }
    .footer {
      margin-top: 28pt; padding-top: 10pt;
      border-top: 1px solid #e7e5e4;
      font-size: 8pt; color: #78716c;
    }
    .footer p { margin: 0 0 2pt; }
    @media print {
      .toolbar { display: none !important; }
      body { background: #fff; }
      .sheet { box-shadow: none; padding: 0; max-width: none; min-height: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar print-hide">
    <span>Letter${input.clientName ? ` · ${escapeHtml(input.clientName)}` : ""} — choose “Save as PDF” in the print dialog</span>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="sheet">
    <div class="accent" aria-hidden="true"></div>
    <header class="header">
      <div>
        ${logo}
        <p class="practice">${escapeHtml(lh.practiceName || "Practice")}</p>
        ${qual}
        ${address ? `<p class="meta">${address}</p>` : ""}
        ${contact ? `<p class="meta">${escapeHtml(contact)}</p>` : ""}
      </div>
      <div class="ref-meta">
        <p class="label">Letter</p>
        <p class="date">${letterDate}</p>
        <p class="title-line">${escapeHtml(input.title)}</p>
      </div>
    </header>
    <div class="letter-body">${paragraphs}</div>
    ${footer ? `<footer class="footer">${footer}</footer>` : ""}
  </div>
  ${autoPrint}
</body>
</html>`;
}

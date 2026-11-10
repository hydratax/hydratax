import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Sa800Draft } from "@/lib/sa800/schema";
import type { Sa800Calculation } from "@/lib/sa800/calculate";
import { sa800TemplateForTaxYear } from "@/lib/sa800/forms";

export type Sa800PdfMeta = {
  submissionRef?: string | null;
  status?: "draft" | "submitted" | "accepted";
};

type Layout = {
  /** Page 2 partnership name line */
  name: { x: number; y: number };
  description: { x: number; y: number };
  periodStart: { x: number; y: number };
  periodEnd: { x: number; y: number };
  box39: { x: number; y: number };
  /** Page 8 declaration */
  printName: { x: number; y: number };
  signatureDate: { x: number; y: number };
};

/** 2026 stationery (tax year 2025–26) */
const LAYOUT_2026: Layout = {
  name: { x: 72, y: 266 },
  description: { x: 72, y: 231 },
  periodStart: { x: 340, y: 150 },
  periodEnd: { x: 460, y: 150 },
  box39: { x: 527, y: 266 },
  printName: { x: 92, y: 158 },
  signatureDate: { x: 460, y: 182 },
};

/** 2023–2025 stationery share one layout family */
const LAYOUT_2025: Layout = {
  name: { x: 72, y: 255 },
  description: { x: 72, y: 220 },
  periodStart: { x: 352, y: 221 },
  periodEnd: { x: 472, y: 221 },
  box39: { x: 527, y: 255 },
  printName: { x: 91, y: 158 },
  signatureDate: { x: 460, y: 182 },
};

const LAYOUT_2023: Layout = {
  ...LAYOUT_2025,
  printName: { x: 91, y: 113 },
  signatureDate: { x: 460, y: 137 },
};

function layoutForFormYear(formYear: number): Layout {
  if (formYear >= 2026) return LAYOUT_2026;
  if (formYear <= 2023) return LAYOUT_2023;
  return LAYOUT_2025;
}

function resolveTemplatePath(filename: string): string {
  const candidates = [
    path.join(process.cwd(), "public", "hmrc", filename),
    path.join(process.cwd(), "hmrc", filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(/* turbopackIgnore: true */ candidate)) return candidate;
  }
  throw new Error(`HMRC SA800 template PDF not found (${filename}).`);
}

function poundsPence(n: number): { pounds: string; pence: string } {
  const v = Math.max(0, Math.round((n + Number.EPSILON) * 100));
  return {
    pounds: String(Math.floor(v / 100)),
    pence: String(v % 100).padStart(2, "0"),
  };
}

function drawLine(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  text: string,
  size = 9,
) {
  if (!text) return;
  page.drawText(text.slice(0, 70), {
    x,
    y,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawX(page: PDFPage, font: PDFFont, x: number, y: number) {
  page.drawText("X", {
    x,
    y,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });
}

/** Money into HMRC £ / pence grid to the right of the £ glyph. */
function drawMoney(
  page: PDFPage,
  font: PDFFont,
  xPound: number,
  y: number,
  amount: number,
) {
  if (!amount) return;
  const { pounds, pence } = poundsPence(amount);
  page.drawText(pounds, {
    x: xPound + 14,
    y: y + 1,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });
  page.drawText(pence, {
    x: xPound + 78,
    y: y + 1,
    size: 9,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawDateBoxes(
  page: PDFPage,
  font: PDFFont,
  x: number,
  y: number,
  isoOrDigits: string,
  pitch = 11,
) {
  const m = isoOrDigits.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const digits = m
    ? `${m[3]}${m[2]}${m[1]}`
    : isoOrDigits.replace(/\D/g, "").slice(0, 8);
  if (!digits) return;
  for (let i = 0; i < digits.length; i++) {
    page.drawText(digits[i]!, {
      x: x + i * pitch,
      y,
      size: 10,
      font,
      color: rgb(0, 0, 0),
    });
  }
}

function banner(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  meta: Sa800PdfMeta,
  width: number,
) {
  const ref = meta.submissionRef?.trim();
  if (!ref) return;
  page.drawRectangle({
    x: 36,
    y: 808,
    width: width - 72,
    height: 22,
    color: rgb(0.94, 0.98, 0.97),
    borderColor: rgb(0.06, 0.46, 0.43),
    borderWidth: 0.8,
  });
  page.drawText(`Submission number: ${ref}`, {
    x: 44,
    y: 815,
    size: 10,
    font: bold,
    color: rgb(0.06, 0.35, 0.32),
  });
  if (meta.status) {
    page.drawText(meta.status.toUpperCase(), {
      x: width - 120,
      y: 815,
      size: 9,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
}

/**
 * Official SA800 Partnership Tax Return with draft answers overlaid —
 * same approach as SA100 stationery fill.
 */
export async function buildSa800Pdf(input: {
  draft: Sa800Draft;
  calculation: Sa800Calculation;
  clientName: string;
  meta?: Sa800PdfMeta;
}): Promise<Uint8Array> {
  const template = sa800TemplateForTaxYear(input.draft.taxYear);
  const layout = layoutForFormYear(template.formYear);
  const templateBytes = fs.readFileSync(
    /* turbopackIgnore: true */ resolveTemplatePath(template.filename),
  );
  const src = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(src, src.getPageIndices());
  for (const page of pages) doc.addPage(page);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const all = doc.getPages();
  const meta = input.meta ?? {};
  for (const page of all) {
    banner(page, font, bold, meta, page.getSize().width);
  }

  const totalIncome = input.calculation.totalIncome;
  const totalExpenses = input.calculation.totalExpenses;
  const profit = input.calculation.profitBeforeAllocation;
  const useDetailed = totalIncome >= 90_000;

  // —— Page 1 — tax reference (UTR) ——
  const p1 = all[0];
  if (p1 && input.draft.partnershipUtr) {
    drawLine(p1, font, 84, 720, input.draft.partnershipUtr, 10);
  }

  // —— Page 2 — partnership details ——
  const p2 = all[1];
  if (p2) {
    drawLine(
      p2,
      font,
      layout.name.x,
      layout.name.y,
      input.draft.partnershipName || input.clientName,
    );
    drawLine(
      p2,
      font,
      layout.description.x,
      layout.description.y,
      input.draft.tradeDescription,
    );
    if (input.draft.booksFrom) {
      drawDateBoxes(
        p2,
        font,
        layout.periodStart.x,
        layout.periodStart.y,
        input.draft.booksFrom,
      );
    }
    if (input.draft.booksTo) {
      drawDateBoxes(
        p2,
        font,
        layout.periodEnd.x,
        layout.periodEnd.y,
        input.draft.booksTo,
      );
    }
    if (input.draft.traditionalAccounting) {
      drawX(p2, bold, layout.box39.x, layout.box39.y);
    }
    // Q3 — trade or profession during the year (Yes)
    drawX(p2, bold, 520, 645);
  }

  // —— Page 3 — simplified income/expenses (always useful; required under £90k) ——
  const p3 = all[2];
  if (p3) {
    drawMoney(p3, font, 484.4, 321.1, totalIncome);
    drawMoney(p3, font, 484.4, 302.1, totalExpenses);
    drawMoney(p3, font, 484, 269.9, profit);
  }

  // —— Page 4 — detailed P&L when turnover ≥ £90k ——
  const p4 = all[3];
  if (p4 && useDetailed) {
    // Approximate HMRC money columns measured from 2026 stationery.
    drawMoney(p4, font, 497.7, 692.1, input.draft.turnover); // 3.29 turnover
    if (input.draft.otherIncome) {
      drawMoney(p4, font, 497.7, 551, input.draft.otherIncome); // 3.50 other income
    }
    drawMoney(p4, font, 390.6, 658.8, input.draft.costOfGoods); // 3.46 cost of sales
    drawMoney(p4, font, 390.6, 531.9, input.draft.staffCosts); // 3.51 employee
    drawMoney(p4, font, 390.6, 510.9, input.draft.premisesCosts); // 3.52 premises
    drawMoney(p4, font, 390.6, 279.9, input.draft.otherExpenses); // 3.63 other
    drawMoney(p4, font, 390.6, 256.3, totalExpenses); // 3.64 total
    drawMoney(p4, font, 497.6, 228, profit); // 3.65 net
  }

  // —— Page 5 — taxable profit ——
  const p5 = all[4];
  if (p5) {
    drawMoney(p5, font, 389.6, 733.3, profit); // 3.83
  }

  // —— Pages 6–7 — partnership statement (short) ——
  const p6 = all[5];
  if (p6) {
    if (input.draft.booksFrom) {
      drawDateBoxes(p6, font, 154, 532, input.draft.booksFrom);
    }
    if (input.draft.booksTo) {
      drawDateBoxes(p6, font, 154, 508, input.draft.booksTo);
    }
    drawLine(p6, font, 154, 473, input.draft.tradeDescription || "Trade", 8);
    // Totals column — box 11 profit
    drawMoney(p6, font, 257, 302.7, profit);

    const partner0 = input.calculation.partnerShares[0];
    if (partner0) {
      drawLine(p6, font, 349, 500, partner0.name, 9);
      if (partner0.nino) drawLine(p6, font, 420, 406, partner0.nino, 8);
      drawMoney(p6, font, 371, 302.7, partner0.profitShare);
    }
  }

  const p7 = all[6];
  if (p7) {
    const partners = input.calculation.partnerShares.slice(1, 3);
    const columns = [
      { nameX: 64, nameY: 500, ninoX: 149, ninoY: 408, moneyX: 95, moneyY: 302 },
      {
        nameX: 334,
        nameY: 500,
        ninoX: 414,
        ninoY: 408,
        moneyX: 371,
        moneyY: 302,
      },
    ];
    partners.forEach((partner, i) => {
      const col = columns[i];
      if (!col) return;
      drawLine(p7, font, col.nameX, col.nameY, partner.name, 9);
      if (partner.nino) {
        drawLine(p7, font, col.ninoX, col.ninoY, partner.nino, 8);
      }
      drawMoney(p7, font, col.moneyX, col.moneyY, partner.profitShare);
    });
  }

  // —— Page 8 — declaration ——
  const p8 = all[7];
  if (p8) {
    // Tick Partnership Statement (short) pages 6 and 7
    drawX(p8, bold, 66, 331);
    const name =
      input.draft.declarationName.trim() ||
      input.calculation.partnerShares[0]?.name ||
      "";
    drawLine(p8, font, layout.printName.x, layout.printName.y, name, 10);
    if (input.draft.declarationDate) {
      drawDateBoxes(
        p8,
        font,
        layout.signatureDate.x,
        layout.signatureDate.y,
        input.draft.declarationDate,
      );
    }
  }

  return doc.save();
}

/** Plain practice working paper (fallback / file note). */
export async function buildSa800SummaryPdf(input: {
  draft: Sa800Draft;
  calculation: Sa800Calculation;
  clientName: string;
  status: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const money = (n: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(n);

  const line = (text: string, opts?: { bold?: boolean; size?: number }) => {
    page.drawText(text, {
      x: 48,
      y,
      size: opts?.size ?? 11,
      font: opts?.bold ? bold : font,
      color: rgb(0.1, 0.12, 0.16),
    });
    y -= (opts?.size ?? 11) + 6;
  };

  line("HydraTax — Partnership return summary", { bold: true, size: 16 });
  line(`Status: ${input.status} · Tax year ${input.draft.taxYear}`);
  y -= 8;
  line(`Client: ${input.clientName}`, { bold: true });
  line(`Partnership: ${input.draft.partnershipName || input.clientName}`);
  line(`Partnership UTR: ${input.draft.partnershipUtr || "—"}`);
  line(`Trade: ${input.draft.tradeDescription || "—"}`);
  line(
    `Accounting period: ${input.draft.booksFrom || "—"} to ${input.draft.booksTo || "—"}`,
  );
  y -= 8;
  line("Income and expenses", { bold: true, size: 13 });
  line(`Turnover: ${money(input.draft.turnover)}`);
  line(`Other income: ${money(input.draft.otherIncome)}`);
  line(`Expenses: ${money(input.calculation.totalExpenses)}`);
  line(
    `Profit for allocation: ${money(input.calculation.profitBeforeAllocation)}`,
    { bold: true },
  );
  y -= 8;
  line("Partner shares", { bold: true, size: 13 });
  for (const p of input.calculation.partnerShares) {
    line(
      `${p.name}${p.nino ? ` · ${p.nino}` : ""} — ${p.sharePct}% · ${money(p.profitShare)}`,
    );
  }
  return doc.save();
}

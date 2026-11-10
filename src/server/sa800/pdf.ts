import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Sa800Draft } from "@/lib/sa800/schema";
import type { Sa800Calculation } from "@/lib/sa800/calculate";

function money(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

/** Practice summary PDF for SA800 draft (not official HMRC stationery). */
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

  line("HydraTax — Partnership return summary (SA800)", {
    bold: true,
    size: 16,
  });
  line(`Status: ${input.status} · Tax year ${input.draft.taxYear}`);
  y -= 8;
  line(`Client: ${input.clientName}`, { bold: true });
  line(
    `Partnership: ${input.draft.partnershipName || input.clientName}`,
  );
  line(`Partnership UTR: ${input.draft.partnershipUtr || "—"}`);
  line(`Trade: ${input.draft.tradeDescription || "—"}`);
  line(
    `Accounting period: ${input.draft.booksFrom || "—"} to ${input.draft.booksTo || "—"}`,
  );
  y -= 8;
  line("Income and expenses", { bold: true, size: 13 });
  line(`Turnover: ${money(input.draft.turnover)}`);
  line(`Other income: ${money(input.draft.otherIncome)}`);
  line(`Cost of goods: ${money(input.draft.costOfGoods)}`);
  line(`Staff costs: ${money(input.draft.staffCosts)}`);
  line(`Premises costs: ${money(input.draft.premisesCosts)}`);
  line(`Other expenses: ${money(input.draft.otherExpenses)}`);
  line(`Profit for allocation: ${money(input.calculation.profitBeforeAllocation)}`, {
    bold: true,
  });
  y -= 8;
  line("Partner shares", { bold: true, size: 13 });
  for (const p of input.calculation.partnerShares) {
    line(
      `${p.name}${p.nino ? ` · ${p.nino}` : ""} — ${p.sharePct}% · ${money(p.profitShare)}`,
    );
  }
  if (!input.calculation.sharePctBalanced) {
    line(
      `Warning: partner shares total ${input.calculation.sharePctTotal.toFixed(1)}% (should be 100%).`,
    );
  }
  y -= 8;
  line(
    `Declared by: ${input.draft.declarationName || "—"} (${input.draft.declarationCapacity || "Partner"})`,
  );
  y -= 16;
  line(
    "This is a practice working paper. Official SA800 stationery filing is not attached yet.",
    { size: 9 },
  );

  return doc.save();
}

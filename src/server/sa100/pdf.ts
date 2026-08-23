import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Sa100Draft } from "@/lib/sa100/schema";
import type { Sa302Result } from "@/lib/sa100/calculate";

function money(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

/** Filled SA100 summary PDF from interactive answers (HydraTax substitute). */
export async function buildSa100Pdf(
  draft: Sa100Draft,
  clientName: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  let y = height - 48;

  const row = (label: string, value: string) => {
    if (y < 48) return;
    page.drawText(label, {
      x: 40,
      y,
      size: 9,
      font: bold,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText(value.slice(0, 85), { x: 230, y, size: 10, font });
    y -= 14;
  };

  page.drawText("SA100 Tax Return 2026 — filled summary", {
    x: 40,
    y,
    size: 15,
    font: bold,
  });
  y -= 16;
  page.drawText(
    `Tax year ${draft.taxYear} (6 Apr 2025 – 5 Apr 2026) · HydraTax substitute`,
    { x: 40, y, size: 9, font, color: rgb(0.35, 0.35, 0.35) },
  );
  y -= 22;

  row("Taxpayer", clientName);
  row("UTR", draft.utr || "—");
  row("NINO", draft.nino || "—");
  row("TR1 box 1 Date of birth", draft.dateOfBirth || "—");
  row("TR1 box 3 Phone", draft.phone || "—");
  y -= 6;
  row("TR2 Employment", draft.hasEmployment ? "Yes" : "No");
  for (const e of draft.employments) {
    row(
      `  ${e.employerName || "Employer"}`,
      `Pay ${money(e.pay)} · Tax ${money(e.taxTakenOff)}`,
    );
  }
  row("TR2 Self-employment", draft.hasSelfEmployment ? "Yes" : "No");
  if (draft.hasSelfEmployment) {
    row("  Turnover", money(draft.seTurnover));
    row("  Expenses", money(draft.seExpenses));
    row("  Capital allowances", money(draft.seCapitalAllowances));
  }
  row("TR2 UK property", draft.hasUkProperty ? "Yes" : "No");
  if (draft.hasUkProperty) {
    row("  Rents", money(draft.propRents));
    row("  Expenses", money(draft.propExpenses));
  }
  y -= 4;
  row("TR3 Interest (taxed UK)", money(draft.interestTaxedUk));
  row("TR3 Interest (untaxed UK)", money(draft.interestUntaxedUk));
  row("TR3 UK dividends", money(draft.dividendsUk));
  row("TR3 State Pension", money(draft.statePension));
  row("TR3 Other pensions", money(draft.otherPensions));
  row("TR4 Gift Aid", money(draft.giftAid));
  row("TR4 Pension RAS", money(draft.pensionReliefAtSource));
  row("TR5 Student loan plan", draft.studentLoanPlan);
  row("TR5 Child Benefit", money(draft.childBenefitAmount));
  y -= 6;
  row(
    "TR8 Declaration",
    draft.declarationAccepted
      ? `Accepted · ${draft.declarationName} · ${draft.declarationDate}`
      : "Not accepted",
  );
  y -= 18;
  page.drawText(
    "HydraTax SA100 substitute filled from your answers. Official HMRC stationery is not redistributed; software produces substitute returns per HMRC guidance.",
    {
      x: 40,
      y,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
      maxWidth: width - 80,
      lineHeight: 11,
    },
  );

  return doc.save();
}

/** SA302-style calculation PDF. */
export async function buildSa302Pdf(
  calc: Sa302Result,
  clientName: string,
  utr: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  let y = height - 48;

  page.drawText("Tax calculation (SA302-style)", {
    x: 40,
    y,
    size: 16,
    font: bold,
  });
  y -= 16;
  page.drawText(
    `${clientName} · UTR ${utr || "—"} · Tax year ${calc.taxYear}`,
    { x: 40, y, size: 9, font, color: rgb(0.35, 0.35, 0.35) },
  );
  y -= 24;

  for (const row of calc.summary) {
    if (y < 72) break;
    page.drawText(row.label, { x: 40, y, size: 10, font });
    page.drawText(money(row.amount), {
      x: width - 140,
      y,
      size: 10,
      font: bold,
    });
    y -= 15;
  }

  y -= 10;
  page.drawText(
    calc.amountDue > 0
      ? `Estimated amount to pay: ${money(calc.amountDue)}`
      : calc.refundDue > 0
        ? `Estimated refund: ${money(calc.refundDue)}`
        : "Nothing due on this estimate",
    { x: 40, y, size: 12, font: bold, color: rgb(0.06, 0.4, 0.35) },
  );
  y -= 18;
  if (calc.paymentsOnAccountEach > 0) {
    page.drawText(
      `Indicative payments on account (each): ${money(calc.paymentsOnAccountEach)}`,
      { x: 40, y, size: 10, font },
    );
    y -= 16;
  }

  y -= 6;
  page.drawText("How Income Tax was worked out", {
    x: 40,
    y,
    size: 11,
    font: bold,
  });
  y -= 14;
  for (const row of calc.breakdown) {
    if (y < 48) break;
    page.drawText(row.label.slice(0, 72), { x: 40, y, size: 8, font });
    page.drawText(money(row.amount), { x: width - 140, y, size: 8, font });
    y -= 11;
  }

  page.drawText(
    "Software tax computation. After HMRC accepts an online return, their SA302 is available in the Personal Tax Account (often after ~72 hours).",
    {
      x: 40,
      y: 28,
      size: 7,
      font,
      color: rgb(0.45, 0.45, 0.45),
      maxWidth: width - 80,
    },
  );

  return doc.save();
}

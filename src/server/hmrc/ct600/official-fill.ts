import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Ct600Figures, Ct600ReviewCompany } from "@/server/hmrc/ct600/types";
import ct600Spec from "@/server/hmrc/ct600/templates/spec-ct600-v3.json";

const MM = 72 / 25.4;
const FONT_SIZE = 12;
const CT600_TEMPLATE_NAME = "CT600-2026-v3.pdf";

type SpecRow = [number, string, ...number[]];

type Annotation =
  | { kind: "WriteString"; page: number; x: number; y: number }
  | { kind: "WriteNumber"; page: number; x: number; y: number }
  | { kind: "WriteBool"; page: number; x: number; y: number }
  | { kind: "SpaceString"; page: number; x: number; y: number; pitch: number }
  | {
      kind: "SpaceZeroPadNumber";
      page: number;
      x: number;
      y: number;
      pitch: number;
      digits: number;
    }
  | { kind: "WritePounds"; page: number; x: number; y: number }
  | { kind: "WriteMoney"; page: number; x: number; y: number }
  | {
      kind: "SpacePounds";
      page: number;
      x: number;
      y: number;
      pitch: number;
      digits: number;
    }
  | {
      kind: "SpaceMoney";
      page: number;
      x: number;
      y: number;
      x2: number;
      y2: number;
      pitch: number;
      digits: number;
    }
  | {
      kind: "WriteSpaceDate";
      page: number;
      x: number;
      y: number;
      x2: number;
      y2: number;
      x3: number;
      y3: number;
      pitch: number;
    }
  | {
      kind: "WriteSpaceSortCode";
      page: number;
      x: number;
      y: number;
      x2: number;
      y2: number;
      x3: number;
      y3: number;
      pitch: number;
    };

function parseSpecRow(row: SpecRow): { box: number; ann: Annotation } {
  const [box, kind, page, ...rest] = row;
  switch (kind) {
    case "WriteString":
    case "WriteNumber":
    case "WriteBool":
      return { box, ann: { kind, page, x: rest[0], y: rest[1] } as Annotation };
    case "SpaceString":
      return {
        box,
        ann: { kind, page, x: rest[0], y: rest[1], pitch: rest[2] },
      };
    case "SpaceZeroPadNumber":
    case "SpacePounds":
      return {
        box,
        ann: {
          kind,
          page,
          x: rest[0],
          y: rest[1],
          pitch: rest[2],
          digits: rest[3],
        },
      };
    case "WritePounds":
    case "WriteMoney":
      return { box, ann: { kind, page, x: rest[0], y: rest[1] } as Annotation };
    case "SpaceMoney":
      return {
        box,
        ann: {
          kind,
          page,
          x: rest[0],
          y: rest[1],
          x2: rest[2],
          y2: rest[3],
          pitch: rest[4],
          digits: rest[5],
        },
      };
    case "WriteSpaceDate":
    case "WriteSpaceSortCode":
      return {
        box,
        ann: {
          kind,
          page,
          x: rest[0],
          y: rest[1],
          x2: rest[2],
          y2: rest[3],
          x3: rest[4],
          y3: rest[5],
          pitch: rest[6],
        },
      };
    default:
      throw new Error(`Unknown CT600 annotation kind: ${kind}`);
  }
}

let specByBox: Map<number, Annotation[]> | null = null;

function resolveCt600TemplatePath(): string {
  const candidates = [
    path.join(process.cwd(), "public/hmrc", CT600_TEMPLATE_NAME),
    path.join(
      process.cwd(),
      "src/server/hmrc/ct600/templates",
      CT600_TEMPLATE_NAME,
    ),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `HMRC CT600 template PDF not found (expected ${CT600_TEMPLATE_NAME} in public/hmrc).`,
  );
}

function loadSpecByBox(): Map<number, Annotation[]> {
  if (specByBox) return specByBox;
  const raw = ct600Spec as SpecRow[];
  const map = new Map<number, Annotation[]>();
  for (const row of raw) {
    const { box, ann } = parseSpecRow(row);
    const list = map.get(box) ?? [];
    list.push(ann);
    map.set(box, list);
  }
  specByBox = map;
  return map;
}

function drawString(
  page: ReturnType<PDFDocument["getPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  xMm: number,
  yMm: number,
  text: string,
) {
  page.drawText(text, {
    x: xMm * MM,
    y: yMm * MM,
    size: FONT_SIZE,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawSpaceString(
  page: ReturnType<PDFDocument["getPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  xMm: number,
  yMm: number,
  pitchMm: number,
  text: string,
) {
  for (let i = 0; i < text.length; i++) {
    drawString(page, font, xMm + pitchMm * i, yMm, text[i]!);
  }
}

function applyAnnotation(
  page: ReturnType<PDFDocument["getPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  ann: Annotation,
  raw: string | number | boolean,
) {
  if (raw === null || raw === undefined || raw === "") return;

  switch (ann.kind) {
    case "WriteString":
      drawString(page, font, ann.x, ann.y, String(raw));
      break;
    case "WriteNumber":
      drawString(page, font, ann.x, ann.y, String(raw));
      break;
    case "WriteBool":
      if (raw === true || raw === "true" || raw === "X") {
        drawString(page, font, ann.x, ann.y, "X");
      }
      break;
    case "SpaceString":
      drawSpaceString(page, font, ann.x, ann.y, ann.pitch, String(raw));
      break;
    case "SpaceZeroPadNumber": {
      const n = parseInt(String(raw), 10);
      const s = String(n).padStart(ann.digits, "0");
      drawSpaceString(page, font, ann.x, ann.y, ann.pitch, s);
      break;
    }
    case "WritePounds": {
      const n = Math.round(Number(raw));
      drawString(page, font, ann.x, ann.y, String(n));
      break;
    }
    case "WriteMoney": {
      const n = Number(raw);
      drawString(page, font, ann.x, ann.y, n.toFixed(2));
      break;
    }
    case "SpacePounds": {
      const n = Math.round(Number(raw));
      const s = String(n).padStart(ann.digits, " ");
      drawSpaceString(page, font, ann.x, ann.y, ann.pitch, s);
      break;
    }
    case "SpaceMoney": {
      const total = Number(raw);
      const pounds = Math.trunc(total);
      const pence = Math.round((total - pounds) * 100 + 0.5);
      const poundsStr = String(pounds).padStart(ann.digits, " ");
      drawSpaceString(page, font, ann.x, ann.y, ann.pitch, poundsStr);
      drawSpaceString(
        page,
        font,
        ann.x2,
        ann.y2,
        ann.pitch,
        String(pence).padStart(2, "0"),
      );
      break;
    }
    case "WriteSpaceDate": {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw));
      if (!m) break;
      drawSpaceString(page, font, ann.x, ann.y, ann.pitch, m[3]!);
      drawSpaceString(page, font, ann.x2, ann.y2, ann.pitch, m[2]!);
      drawSpaceString(page, font, ann.x3, ann.y3, ann.pitch, m[1]!);
      break;
    }
    case "WriteSpaceSortCode": {
      const s = String(raw).replace(/\D/g, "").padStart(6, "0").slice(0, 6);
      drawSpaceString(page, font, ann.x, ann.y, ann.pitch, s.slice(0, 2));
      drawSpaceString(page, font, ann.x2, ann.y2, ann.pitch, s.slice(2, 4));
      drawSpaceString(page, font, ann.x3, ann.y3, ann.pitch, s.slice(4, 6));
      break;
    }
    default:
      break;
  }
}

function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function daysInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** UK CT financial year label (year starting 1 April). */
function financialYearStart(date: Date): number {
  const y = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  if (month < 3 || (month === 3 && day < 1)) return y - 1;
  return y;
}

function endOfFinancialYear(fyStart: number): Date {
  return new Date(Date.UTC(fyStart + 1, 2, 31));
}

function apportionProfitByFinancialYear(
  periodStart: string,
  periodEnd: string,
  profitPence: number,
): Array<{ fy: number; profitPence: number }> {
  if (profitPence <= 0) return [];
  const start = parseIsoDate(periodStart);
  const end = parseIsoDate(periodEnd);
  const totalDays = daysInclusive(start, end);
  if (totalDays <= 0) return [];

  const slices = new Map<number, number>();
  let cursor = start;
  while (cursor <= end) {
    const fy = financialYearStart(cursor);
    const sliceEnd = endOfFinancialYear(fy);
    const periodSliceEnd = sliceEnd < end ? sliceEnd : end;
    const days = daysInclusive(cursor, periodSliceEnd);
    const share = Math.round((profitPence * days) / totalDays);
    slices.set(fy, (slices.get(fy) ?? 0) + share);
    cursor = new Date(periodSliceEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return [...slices.entries()]
    .sort(([a], [b]) => a - b)
    .map(([fy, pence]) => ({ fy, profitPence: pence }));
}

function isDormantFigures(figures: Ct600Figures): boolean {
  return (
    Number(figures.turnoverPence) === 0 &&
    Number(figures.otherIncomePence) === 0 &&
    Number(figures.costOfSalesPence) === 0 &&
    Number(figures.administrativeExpensesPence) === 0
  );
}

const CT_RATE = 19;

/** Map return figures to CT600 box numbers (ct600-fill coordinate spec). */
export function buildCt600BoxValues(opts: {
  company: Ct600ReviewCompany;
  figures: Ct600Figures;
  taxableProfitPence: number;
  taxChargePence: number;
}): Record<number, string | number | boolean> {
  const { company, figures, taxableProfitPence, taxChargePence } = opts;
  const dormant = isDormantFigures(figures);

  const turnover = dormant
    ? 0
    : Math.round(Number(figures.turnoverPence) / 100);
  const otherIncome = dormant
    ? 0
    : Math.round(Number(figures.otherIncomePence) / 100);
  const tradingProfit = dormant
    ? 0
    : Math.max(
        0,
        Math.round(
          (Number(figures.turnoverPence) -
            Number(figures.costOfSalesPence) -
            Number(figures.administrativeExpensesPence)) /
            100,
        ),
      );
  const netTrading = tradingProfit;
  const profitsBeforeDeductions = netTrading + otherIncome;
  const chargeableProfit = dormant
    ? 0
    : Math.max(0, Math.round(taxableProfitPence / 100));
  const taxDue = dormant ? 0 : taxChargePence / 100;

  const declarant =
    company.declarantName?.trim() ||
    company.directors?.find(Boolean) ||
    "";
  const today = new Date().toISOString().slice(0, 10);

  const values: Record<number, string | number | boolean> = {
    1: company.name.toUpperCase(),
    2: (company.companyNumber ?? "").replace(/\s/g, ""),
    3: (company.utr ?? "").replace(/\s/g, ""),
    4: 0,
    30: figures.periodStart,
    35: figures.periodEnd,
    80: true,
    145: turnover,
    155: tradingProfit,
    160: 0,
    165: netTrading,
    170: otherIncome,
    235: profitsBeforeDeductions,
    295: 0,
    300: profitsBeforeDeductions,
    305: 0,
    310: 0,
    312: 0,
    315: chargeableProfit,
    326: 0,
    440: taxDue,
    475: taxDue,
    528: taxDue,
    618: true,
    975: declarant.toUpperCase(),
    980: today,
    985: company.declarantStatus?.trim() || "Director",
  };

  if (dormant) {
    values[329] = true;
  }

  const fySlices = apportionProfitByFinancialYear(
    figures.periodStart,
    figures.periodEnd,
    chargeableProfit * 100,
  );
  const taxSlices = apportionProfitByFinancialYear(
    figures.periodStart,
    figures.periodEnd,
    dormant ? 0 : taxChargePence,
  );
  const fyRows: Array<[number, number, number, number]> = [
    [330, 335, 340, 345],
    [350, 355, 360, 365],
    [370, 375, 380, 385],
  ];
  for (let i = 0; i < fySlices.length && i < fyRows.length; i++) {
    const slice = fySlices[i]!;
    const taxSlice = taxSlices[i]?.profitPence ?? 0;
    const [yearBox, profitBox, rateBox, taxBox] = fyRows[i]!;
    const profit = Math.round(slice.profitPence / 100);
    const tax = taxSlice / 100;
    values[yearBox] = String(slice.fy);
    values[profitBox] = profit;
    values[rateBox] = profit > 0 ? CT_RATE : 0;
    values[taxBox] = tax;
  }

  return values;
}

/** Fill the HMRC CT600 PDF template with return figures (box coordinates from ct600-fill). */
export async function fillOfficialCt600Pdf(opts: {
  company: Ct600ReviewCompany;
  figures: Ct600Figures;
  taxableProfitPence: number;
  taxChargePence: number;
}): Promise<Uint8Array> {
  const templatePath = resolveCt600TemplatePath();
  const templateBytes = fs.readFileSync(templatePath);
  const doc = await PDFDocument.load(templateBytes);
  const font = await doc.embedFont(StandardFonts.CourierBold);
  const spec = loadSpecByBox();
  const values = buildCt600BoxValues(opts);

  for (const [boxKey, value] of Object.entries(values)) {
    const box = Number(boxKey);
    const annotations = spec.get(box);
    if (!annotations?.length) continue;
    for (const ann of annotations) {
      const page = doc.getPage(ann.page);
      applyAnnotation(page, font, ann, value);
    }
  }

  return doc.save();
}

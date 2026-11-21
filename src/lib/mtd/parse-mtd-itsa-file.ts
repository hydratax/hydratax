/**
 * Parse an MTD for Income Tax (ITSA) bridging / quarterly-update file into
 * SA103F self-employment money fields (cumulative pounds for the tax year).
 *
 * Figures are summaries for quarterly updates — not a full SA100 return.
 * Source: GOV.UK “Use Making Tax Digital for Income Tax”.
 */

import {
  SA103F_HEAD_META,
  type SaSelfEmploymentMoneyField,
} from "@/server/bank/sa-box-map";

export type ItsaMtdFigures = Partial<Record<SaSelfEmploymentMoneyField, number>>;

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[£$,\s]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function matchField(label: string): SaSelfEmploymentMoneyField | null {
  const norm = label.toLowerCase().replace(/\s+/g, " ").trim();
  for (const meta of SA103F_HEAD_META) {
    if (norm.includes(`box ${meta.box}`) || norm.includes(`box${meta.box}`)) {
      return meta.field;
    }
    const words = meta.label.toLowerCase().slice(0, 24);
    if (norm.includes(words)) return meta.field;
  }
  // Common bridging aliases
  if (/turnover|sales(?!.*expense)/i.test(norm)) return "seTurnover";
  if (/other business income/i.test(norm)) return "seOtherBusinessIncome";
  if (/cost of goods|goods bought/i.test(norm)) return "seCostOfGoods";
  if (/wages|salaries|staff/i.test(norm)) return "seWages";
  if (/car|van|travel/i.test(norm)) return "seCarVanTravel";
  if (/rent|rates|power|insurance/i.test(norm)) return "seRentPowerInsurance";
  if (/repairs|maintenance/i.test(norm)) return "seRepairs";
  if (/phone|stationery|office/i.test(norm)) return "sePhoneOffice";
  if (/advertis/i.test(norm)) return "seAdvertising";
  if (/interest on/i.test(norm)) return "seInterest";
  if (/bank.*charge|financial charge/i.test(norm)) return "seBankCharges";
  if (/bad debt/i.test(norm)) return "seBadDebts";
  if (/accountancy|legal|professional/i.test(norm)) return "seProfessionalFees";
  if (/depreciation/i.test(norm)) return "seDepreciation";
  if (/other (business )?expense/i.test(norm)) return "seOtherExpensesDetail";
  if (/subcontractor|cis/i.test(norm)) return "seCisSubcontractors";
  return null;
}

export type ParseMtdItsaResult =
  | { ok: true; figures: ItsaMtdFigures; filledCount: number }
  | { ok: false; error: string };

export function parseMtdItsaFileText(text: string): ParseMtdItsaResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return { ok: false, error: "Empty file" };

  const figures: ItsaMtdFigures = {};

  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        const field =
          SA103F_HEAD_META.find((m) => m.field === k)?.field ??
          matchField(k);
        if (!field) continue;
        const n =
          typeof v === "number" ? v : parseAmount(String(v ?? ""));
        if (n == null) continue;
        figures[field] = n;
      }
    } catch {
      return { ok: false, error: "Could not read JSON MTD file" };
    }
  } else {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.includes("\t")
        ? line.split("\t")
        : line.includes(",")
          ? line.split(",")
          : line.split(/\s{2,}/);
      if (parts.length < 2) {
        const colon = /^(.+?)[:\-]\s*([£$]?[\d,.]+)\s*$/.exec(line);
        if (!colon) continue;
        const field = matchField(colon[1]!);
        const amount = parseAmount(colon[2]!);
        if (field && amount != null) figures[field] = amount;
        continue;
      }
      const label = parts[0]!.replace(/^["']|["']$/g, "").trim();
      const amount = parseAmount(parts[parts.length - 1]!);
      if (amount == null) continue;
      const field = matchField(label);
      if (field) figures[field] = amount;
    }
  }

  const filledCount = Object.keys(figures).length;
  if (!filledCount) {
    return {
      ok: false,
      error:
        "No Self Assessment MTD figures found — use SA103 box labels (e.g. Box 15 turnover) or a bridging CSV",
    };
  }
  return { ok: true, figures, filledCount };
}

export async function parseMtdItsaFile(file: File): Promise<ParseMtdItsaResult> {
  const name = file.name.toLowerCase();
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel")
  ) {
    return {
      ok: false,
      error: "Save the spreadsheet as CSV or TXT, then upload again",
    };
  }
  return parseMtdItsaFileText(await file.text());
}

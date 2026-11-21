/**
 * Parse a bridging / MTD VAT return file into the nine boxes.
 *
 * Accepted shapes (HMRC accepts CSV/XML/spreadsheet digital links — Notice 700/22):
 * - Label + amount rows (e.g. "VAT due on sales", 123.45)
 * - TaxMan-style key=value (`4=` = Box 1 … `12=` = Box 9)
 * - JSON with HydraTax keys or box1…box9
 * - CSV with Box 1 … Box 9 headers
 */

import { VAT_BOX_DEFINITIONS } from "@/lib/hmrc/filing-guides";

export type VatMtdBoxKey = (typeof VAT_BOX_DEFINITIONS)[number]["key"];

export type VatMtdBoxes = Record<VatMtdBoxKey, number>;

const EMPTY: VatMtdBoxes = {
  vatDueSales: 0,
  vatDueAcquisitions: 0,
  totalVatDue: 0,
  vatReclaimedCurrPeriod: 0,
  netVatDue: 0,
  totalValueSalesExVAT: 0,
  totalValuePurchasesExVAT: 0,
  totalValueGoodsSuppliedExVAT: 0,
  totalAcquisitionsExVAT: 0,
};

/** Label fragments → box key (order matters — more specific first). */
const LABEL_MAP: Array<{ match: RegExp; key: VatMtdBoxKey }> = [
  { match: /vat due on (sales|outputs)|box\s*1\b/i, key: "vatDueSales" },
  {
    match: /vat due on (ec |eu )?acquisitions|box\s*2\b/i,
    key: "vatDueAcquisitions",
  },
  { match: /total vat due|box\s*3\b/i, key: "totalVatDue" },
  {
    match: /vat reclaimed|reclaimed on purchases|box\s*4\b/i,
    key: "vatReclaimedCurrPeriod",
  },
  { match: /net vat|vat to pay|box\s*5\b/i, key: "netVatDue" },
  {
    match: /total (value of )?sales|sales.*excl|box\s*6\b/i,
    key: "totalValueSalesExVAT",
  },
  {
    match: /total (value of )?purchases|purchases.*excl|box\s*7\b/i,
    key: "totalValuePurchasesExVAT",
  },
  {
    match: /goods supplied|supplies to (ec|eu)|box\s*8\b/i,
    key: "totalValueGoodsSuppliedExVAT",
  },
  {
    match: /acquisitions from (ec|eu)|box\s*9\b/i,
    key: "totalAcquisitionsExVAT",
  },
];

const TAXMAN_KEY_TO_BOX: Record<string, VatMtdBoxKey> = {
  "4": "vatDueSales",
  "5": "vatDueAcquisitions",
  "6": "totalVatDue",
  "7": "vatReclaimedCurrPeriod",
  "8": "netVatDue",
  "9": "totalValueSalesExVAT",
  "10": "totalValuePurchasesExVAT",
  "11": "totalValueGoodsSuppliedExVAT",
  "12": "totalAcquisitionsExVAT",
};

const JSON_ALIASES: Record<string, VatMtdBoxKey> = {
  vatduesales: "vatDueSales",
  box1: "vatDueSales",
  vatdueacquisitions: "vatDueAcquisitions",
  box2: "vatDueAcquisitions",
  totalvatdue: "totalVatDue",
  box3: "totalVatDue",
  vatreclaimedcurrperiod: "vatReclaimedCurrPeriod",
  vatreclaimed: "vatReclaimedCurrPeriod",
  box4: "vatReclaimedCurrPeriod",
  netvatdue: "netVatDue",
  box5: "netVatDue",
  totalvaluesalesexvat: "totalValueSalesExVAT",
  box6: "totalValueSalesExVAT",
  totalvaluepurchasesexvat: "totalValuePurchasesExVAT",
  box7: "totalValuePurchasesExVAT",
  totalvaluegoodssuppliedexvat: "totalValueGoodsSuppliedExVAT",
  box8: "totalValueGoodsSuppliedExVAT",
  totalacquisitionsexvat: "totalAcquisitionsExVAT",
  box9: "totalAcquisitionsExVAT",
};

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[£$,\s]/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function applyLabel(out: VatMtdBoxes, label: string, amount: number) {
  for (const row of LABEL_MAP) {
    if (row.match.test(label)) {
      out[row.key] = amount;
      return;
    }
  }
}

function recompute(out: VatMtdBoxes) {
  out.totalVatDue = Math.round((out.vatDueSales + out.vatDueAcquisitions) * 100) / 100;
  out.netVatDue =
    Math.round(Math.abs(out.totalVatDue - out.vatReclaimedCurrPeriod) * 100) / 100;
}

export type ParseMtdVatResult =
  | { ok: true; boxes: VatMtdBoxes; filledCount: number }
  | { ok: false; error: string };

/**
 * Parse file text (CSV / TXT / JSON). Amounts are pounds (2 dp), not pence.
 */
export function parseMtdVatFileText(text: string): ParseMtdVatResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return { ok: false, error: "Empty file" };

  const out: VatMtdBoxes = { ...EMPTY };

  // JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed) as unknown;
      const obj = Array.isArray(data)
        ? Object.fromEntries(
            data.flatMap((row) => {
              if (!row || typeof row !== "object") return [];
              const r = row as Record<string, unknown>;
              const k = String(r.key ?? r.box ?? r.label ?? "");
              const v = r.value ?? r.amount ?? r.pounds;
              return k ? [[k, v]] : [];
            }),
          )
        : (data as Record<string, unknown>);
      for (const [k, v] of Object.entries(obj)) {
        const alias = JSON_ALIASES[k.replace(/[^a-z0-9]/gi, "").toLowerCase()];
        if (!alias) continue;
        const n =
          typeof v === "number"
            ? v
            : parseAmount(String(v ?? ""));
        if (n == null) continue;
        out[alias] = n;
      }
    } catch {
      return { ok: false, error: "Could not read JSON MTD file" };
    }
  } else {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      // TaxMan 4=200.00
      const kv = /^(\d{1,2})\s*=\s*(.+)$/.exec(line);
      if (kv) {
        const key = TAXMAN_KEY_TO_BOX[kv[1]!];
        const amount = parseAmount(kv[2]!);
        if (key && amount != null) out[key] = amount;
        continue;
      }

      // CSV / TSV / "label,amount" / "label amount"
      const parts = line.includes("\t")
        ? line.split("\t")
        : line.includes(",")
          ? line.split(",")
          : line.split(/\s{2,}/);
      if (parts.length >= 2) {
        const label = parts[0]!.replace(/^["']|["']$/g, "").trim();
        const amount = parseAmount(parts[parts.length - 1]!);
        if (amount != null) applyLabel(out, label, amount);
        continue;
      }

      // "Box 1: 12.34" or "VAT due on sales 12.34"
      const colon = /^(.+?)[:\-]\s*([£$]?[\d,.]+)\s*$/.exec(line);
      if (colon) {
        const amount = parseAmount(colon[2]!);
        if (amount != null) applyLabel(out, colon[1]!, amount);
      }
    }
  }

  recompute(out);
  const filledCount = (
    Object.keys(EMPTY) as VatMtdBoxKey[]
  ).filter((k) => k !== "totalVatDue" && k !== "netVatDue" && out[k] !== 0)
    .length;

  if (filledCount === 0 && out.vatDueSales === 0 && out.vatReclaimedCurrPeriod === 0) {
    return {
      ok: false,
      error: "No VAT box figures found — use Box 1–9 labels or a VAT bridging CSV",
    };
  }

  return { ok: true, boxes: out, filledCount: Math.max(filledCount, 1) };
}

export async function parseMtdVatFile(file: File): Promise<ParseMtdVatResult> {
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
  const text = await file.text();
  return parseMtdVatFileText(text);
}

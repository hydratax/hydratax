/**
 * bankbee — map categorised bank transactions → VAT return nine boxes.
 *
 * Like sa-box-map.ts maps categories to SA103F fields, this maps them to
 * the MTD VAT nine-box return. Each bank category gets a default VAT
 * treatment (standard 20%, reduced 5%, zero 0%, exempt, outside-scope).
 *
 * Bank amounts are assumed VAT-inclusive for standard/reduced rated items.
 * The accountant can override box values after auto-fill.
 *
 * Rates: standard 20% / reduced 5% / zero 0% — from HMRC rulebook.
 * Source: https://www.gov.uk/vat-rates
 */

import type { BankCategory } from "@/lib/bank-categories";
import {
  VAT_REDUCED_INCLUSIVE_FRACTION,
  VAT_STANDARD_INCLUSIVE_FRACTION,
  VAT_ZERO_RATE,
} from "@/lib/vat-rates";
import { pence, type Pence } from "@/server/money/pence";

export type VatTreatment =
  | "standard"    // 20%
  | "reduced"     // 5%
  | "zero"        // 0% (still VAT-able — input VAT reclaimable)
  | "exempt"      // No VAT; no input reclaim
  | "outside";    // Outside scope of VAT

export type VatDirection = "output" | "input" | "none";

type VatCategoryMapping = {
  treatment: VatTreatment;
  direction: VatDirection;
};

/** VAT fraction for each treatment (amount inclusive → VAT element). */
const VAT_FRACTIONS: Record<VatTreatment, number> = {
  standard: VAT_STANDARD_INCLUSIVE_FRACTION, // 20/120
  reduced: VAT_REDUCED_INCLUSIVE_FRACTION, // 5/105
  zero: VAT_ZERO_RATE,
  exempt: 0,
  outside: 0,
};

/** Default VAT treatment per bank category. Accountant overrides in UI. */
const CATEGORY_VAT_MAP: Record<BankCategory, VatCategoryMapping> = {
  turnover:               { treatment: "standard", direction: "output" },
  other_income:           { treatment: "standard", direction: "output" },
  cost_of_sales:          { treatment: "standard", direction: "input" },
  salaries:               { treatment: "outside",  direction: "none" },
  subcontractors:         { treatment: "outside",  direction: "none" },
  directors_remuneration: { treatment: "outside",  direction: "none" },
  dividends:              { treatment: "outside",  direction: "none" },
  accountancy:            { treatment: "standard", direction: "input" },
  consultancy:            { treatment: "standard", direction: "input" },
  legal_professional:     { treatment: "standard", direction: "input" },
  rent_rates:             { treatment: "exempt",   direction: "none" },
  advertising:            { treatment: "standard", direction: "input" },
  bank_charges:           { treatment: "exempt",   direction: "none" },
  insurance:              { treatment: "exempt",   direction: "none" },
  finance:                { treatment: "exempt",   direction: "none" },
  travel:                 { treatment: "standard", direction: "input" },
  fuel:                   { treatment: "standard", direction: "input" },
  admin_office:           { treatment: "standard", direction: "input" },
  depreciation:           { treatment: "outside",  direction: "none" },
  admin_expenses:         { treatment: "standard", direction: "input" },
  expense_queries:        { treatment: "standard", direction: "input" },
  trade_debtors:          { treatment: "outside",  direction: "none" },
  premises:               { treatment: "exempt",   direction: "none" },
  professional_fees:      { treatment: "standard", direction: "input" },
  drawings:               { treatment: "outside",  direction: "none" },
  tax:                    { treatment: "outside",  direction: "none" },
  transfer:               { treatment: "outside",  direction: "none" },
  uncategorised:          { treatment: "outside",  direction: "none" },
};

export function getVatMapping(category: string): VatCategoryMapping {
  if (category.startsWith("custom:")) {
    return { treatment: "standard", direction: "input" };
  }
  return (
    CATEGORY_VAT_MAP[category as BankCategory] ?? {
      treatment: "outside",
      direction: "none",
    }
  );
}

export function vatFraction(treatment: VatTreatment): number {
  return VAT_FRACTIONS[treatment];
}

export type VatBoxRollup = {
  /** Box 1: VAT due on sales (output VAT) in pence */
  vatDueSales: number;
  /** Box 2: VAT due on EC acquisitions */
  vatDueAcquisitions: number;
  /** Box 3: Total VAT due (1 + 2) */
  totalVatDue: number;
  /** Box 4: VAT reclaimed on purchases (input VAT) */
  vatReclaimedCurrPeriod: number;
  /** Box 5: Net VAT due |3 − 4| */
  netVatDue: number;
  /** Box 6: Total sales ex VAT */
  totalValueSalesExVAT: number;
  /** Box 7: Total purchases ex VAT */
  totalValuePurchasesExVAT: number;
  /** Box 8: Goods supplied to EC ex VAT */
  totalValueGoodsSuppliedExVAT: number;
  /** Box 9: Acquisitions from EC ex VAT */
  totalAcquisitionsExVAT: number;
};

export type VatBoxRollupPence = {
  [K in keyof VatBoxRollup]: Pence;
};

export type VatCategoryBreakdown = {
  category: string;
  lineCount: number;
  grossPence: number;
  vatPence: number;
  netPence: number;
  treatment: VatTreatment;
  direction: VatDirection;
};

export type MapBankToVatResult = {
  boxes: VatBoxRollupPence;
  breakdown: VatCategoryBreakdown[];
  outsideScopeLineCount: number;
  outsideScopeGrossPence: number;
};

/**
 * Map categorised bank lines into VAT nine-box figures (pence).
 *
 * Bank amounts are VAT-inclusive for standard/reduced rated.
 * - Income (amountPence > 0) with output direction → Box 1 + Box 6
 * - Expenses (amountPence < 0) with input direction → Box 4 + Box 7
 * - Outside scope / exempt → excluded from VAT boxes
 *
 * @param lines - Categorised bank transactions for the period
 * @param overrides - Optional per-category treatment overrides
 * @param directionOverrides - Optional per-category direction (SA-style allocate)
 */
export function mapBankToVatBoxes(
  lines: Array<{ category: string; amountPence: number; dated: string }>,
  overrides?: Partial<Record<string, VatTreatment>>,
  directionOverrides?: Partial<Record<string, VatDirection>>,
): MapBankToVatResult {
  let box1 = 0; // VAT due on sales
  let box4 = 0; // VAT reclaimed
  let box6 = 0; // Total sales ex VAT
  let box7 = 0; // Total purchases ex VAT

  const buckets = new Map<
    string,
    {
      lineCount: number;
      grossPence: number;
      vatPence: number;
      netPence: number;
      treatment: VatTreatment;
      direction: VatDirection;
    }
  >();

  let outsideScopeLineCount = 0;
  let outsideScopeGrossPence = 0;

  for (const line of lines) {
    const mapping = getVatMapping(line.category);
    const treatment = overrides?.[line.category] ?? mapping.treatment;
    const direction =
      directionOverrides?.[line.category] ?? mapping.direction;
    const frac = vatFraction(treatment);
    const gross = Math.abs(line.amountPence);

    // Bucket for breakdown
    const key = line.category;
    const bucket = buckets.get(key) ?? {
      lineCount: 0,
      grossPence: 0,
      vatPence: 0,
      netPence: 0,
      treatment,
      direction,
    };
    bucket.lineCount += 1;
    bucket.grossPence += gross;

    if (direction === "none" || treatment === "outside" || treatment === "exempt") {
      outsideScopeLineCount += 1;
      outsideScopeGrossPence += gross;
      bucket.netPence += gross;
      buckets.set(key, bucket);
      continue;
    }

    const vatElement = Math.round(gross * frac);
    const netElement = gross - vatElement;
    bucket.vatPence += vatElement;
    bucket.netPence += netElement;
    buckets.set(key, bucket);

    // Accountant allocate dropdowns are explicit — honour the chosen boxes with
    // the absolute amount (do not flip purchases↔refunds from bank sign alone).
    const explicitDirection = directionOverrides?.[line.category] != null;
    if (explicitDirection) {
      if (direction === "output") {
        box1 += vatElement;
        box6 += netElement;
      } else if (direction === "input") {
        box4 += vatElement;
        box7 += netElement;
      }
      continue;
    }

    if (direction === "output" && line.amountPence > 0) {
      // Sales — output VAT
      box1 += vatElement;
      box6 += netElement;
    } else if (direction === "input" && line.amountPence < 0) {
      // Purchases — input VAT (reclaimable)
      box4 += vatElement;
      box7 += netElement;
    } else if (direction === "output" && line.amountPence < 0) {
      // Credit note on sales — reduce output
      box1 -= vatElement;
      box6 -= netElement;
    } else if (direction === "input" && line.amountPence > 0) {
      // Refund on purchases — reduce input
      box4 -= vatElement;
      box7 -= netElement;
    }
  }

  // Ensure no negative boxes
  box1 = Math.max(0, box1);
  box4 = Math.max(0, box4);
  box6 = Math.max(0, box6);
  box7 = Math.max(0, box7);

  const box3 = box1 + 0; // Box 2 is 0 for domestic-only
  const box5 = Math.abs(box3 - box4);

  const breakdown: VatCategoryBreakdown[] = [];
  for (const [category, b] of buckets) {
    breakdown.push({
      category,
      lineCount: b.lineCount,
      grossPence: b.grossPence,
      vatPence: b.vatPence,
      netPence: b.netPence,
      treatment: b.treatment,
      direction: b.direction,
    });
  }
  breakdown.sort((a, b) => b.grossPence - a.grossPence);

  return {
    boxes: {
      vatDueSales: pence(box1),
      vatDueAcquisitions: pence(0),
      totalVatDue: pence(box3),
      vatReclaimedCurrPeriod: pence(box4),
      netVatDue: pence(box5),
      totalValueSalesExVAT: pence(box6),
      totalValuePurchasesExVAT: pence(box7),
      totalValueGoodsSuppliedExVAT: pence(0),
      totalAcquisitionsExVAT: pence(0),
    },
    breakdown,
    outsideScopeLineCount,
    outsideScopeGrossPence,
  };
}

/** Category labels for VAT treatment display. */
export const VAT_TREATMENT_LABELS: Record<VatTreatment, string> = {
  standard: "Standard (20%)",
  reduced: "Reduced (5%)",
  zero: "Zero-rated (0%)",
  exempt: "Exempt",
  outside: "Outside scope",
};

/** All known categories with their default VAT treatment, for the UI. */
export function allCategoryVatDefaults(): Array<{
  category: string;
  treatment: VatTreatment;
  direction: VatDirection;
}> {
  return Object.entries(CATEGORY_VAT_MAP).map(([cat, mapping]) => ({
    category: cat,
    treatment: mapping.treatment,
    direction: mapping.direction,
  }));
}

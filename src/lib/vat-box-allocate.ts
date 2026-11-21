/**
 * SA-style allocation choices for a VAT transaction-head card.
 * Maps onto treatment + direction used by mapBankToVatBoxes.
 */

export type VatAllocateTreatment =
  | "standard"
  | "reduced"
  | "zero"
  | "exempt"
  | "outside";

export type VatAllocateDirection = "output" | "input" | "none";

export type VatAllocateChoice =
  | "default"
  | "sales_standard"
  | "sales_zero"
  | "purchases_standard"
  | "purchases_reduced"
  | "purchases_zero"
  | "exempt"
  | "outside";

export const VAT_ALLOCATE_CHOICES: Array<{
  id: VatAllocateChoice;
  label: string;
}> = [
  { id: "default", label: "Auto (from books head)" },
  { id: "sales_standard", label: "Box 1 & 6 — Sales (20%)" },
  { id: "sales_zero", label: "Box 6 — Zero-rated sales" },
  { id: "purchases_standard", label: "Box 4 & 7 — Purchases (20%)" },
  { id: "purchases_reduced", label: "Box 4 & 7 — Purchases (5%)" },
  { id: "purchases_zero", label: "Box 7 — Zero-rated purchases" },
  { id: "exempt", label: "Exempt" },
  { id: "outside", label: "Outside scope" },
];

export type VatCategoryOverride = {
  treatment: VatAllocateTreatment;
  direction: VatAllocateDirection;
};

export function vatAllocateToOverride(
  choice: VatAllocateChoice,
): VatCategoryOverride | null {
  switch (choice) {
    case "sales_standard":
      return { treatment: "standard", direction: "output" };
    case "sales_zero":
      return { treatment: "zero", direction: "output" };
    case "purchases_standard":
      return { treatment: "standard", direction: "input" };
    case "purchases_reduced":
      return { treatment: "reduced", direction: "input" };
    case "purchases_zero":
      return { treatment: "zero", direction: "input" };
    case "exempt":
      return { treatment: "exempt", direction: "none" };
    case "outside":
      return { treatment: "outside", direction: "none" };
    default:
      return null;
  }
}

/** Build mapBankToVatBoxes override maps from per-category allocate choices. */
export function buildVatOverridesFromChoices(
  choices: Record<string, VatAllocateChoice>,
): {
  treatments: Partial<Record<string, VatAllocateTreatment>>;
  directions: Partial<Record<string, VatAllocateDirection>>;
} {
  const treatments: Partial<Record<string, VatAllocateTreatment>> = {};
  const directions: Partial<Record<string, VatAllocateDirection>> = {};
  for (const [category, choice] of Object.entries(choices)) {
    const ov = vatAllocateToOverride(choice);
    if (!ov) continue;
    treatments[category] = ov.treatment;
    directions[category] = ov.direction;
  }
  return { treatments, directions };
}

/**
 * Heads with period lines still on "Auto (from books head)" — accountant must
 * pick a VAT box mapping before filling the return from the transactions card.
 */
export function categoriesNeedingVatAllocate(
  categoryIds: Iterable<string>,
  choices: Record<string, VatAllocateChoice>,
): string[] {
  const needing: string[] = [];
  const seen = new Set<string>();
  for (const category of categoryIds) {
    if (!category || seen.has(category)) continue;
    seen.add(category);
    const choice = choices[category] ?? "default";
    if (choice === "default") needing.push(category);
  }
  return needing;
}

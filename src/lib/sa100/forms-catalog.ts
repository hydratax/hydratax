import type { Sa100Draft } from "@/lib/sa100/schema";

export type SaFormKind = "main" | "supplement" | "manual";

export type SaFormAttachRule =
  | "employment"
  | "self_employment"
  | "partnership"
  | "uk_property"
  | "foreign"
  | "capital_gains"
  | "residence"
  | null;

export type SaFormTemplate = {
  formCode: string;
  taxYear: string;
  title: string;
  /** Filename under public/hmrc/ */
  filename: string;
  kind: SaFormKind;
  /** When kind=supplement, which draft flag attaches this form to SA100. */
  attachRule: SaFormAttachRule;
};

/**
 * Official HMRC stationery held with the product (and mirrored in
 * hmrc_sa_form_templates). Personal SA packs never include SA800 —
 * partnership returns are filled from the partnership desk (`/sa800`).
 * Filenames historically contain “man” but the 8-page PDFs are the return.
 */
export const SA_FORM_CATALOG: readonly SaFormTemplate[] = [
  {
    formCode: "SA800",
    taxYear: "2025-26",
    title: "Partnership Tax Return 2026 (SA800)",
    filename: "SA800man-2026.pdf",
    kind: "main",
    attachRule: null,
  },
  {
    formCode: "SA800",
    taxYear: "2024-25",
    title: "Partnership Tax Return 2025 (SA800)",
    filename: "SA800man_2025.pdf",
    kind: "main",
    attachRule: null,
  },
  {
    formCode: "SA800",
    taxYear: "2023-24",
    title: "Partnership Tax Return 2024 (SA800)",
    filename: "SA800man_2024.pdf",
    kind: "main",
    attachRule: null,
  },
  {
    formCode: "SA800",
    taxYear: "2022-23",
    title: "Partnership Tax Return 2023 (SA800)",
    filename: "sa800man_2023.pdf",
    kind: "main",
    attachRule: null,
  },
  {
    formCode: "SA100",
    taxYear: "2025-26",
    title: "Tax Return 2026 (SA100)",
    filename: "SA100-2026.pdf",
    kind: "main",
    attachRule: null,
  },
  {
    formCode: "SA102",
    taxYear: "2025-26",
    title: "Employment (SA102)",
    filename: "SA102-2026.pdf",
    kind: "supplement",
    attachRule: "employment",
  },
  {
    formCode: "SA103F",
    taxYear: "2025-26",
    title: "Self-employment full (SA103F)",
    filename: "SA103F_2026.pdf",
    kind: "supplement",
    attachRule: "self_employment",
  },
  {
    formCode: "SA103S",
    taxYear: "2025-26",
    title: "Self-employment short (SA103S)",
    filename: "SA103S-2026.pdf",
    kind: "supplement",
    // Prefer full form SA103F for packs; short form kept on file for later use.
    attachRule: null,
  },
  {
    formCode: "SA104F",
    taxYear: "2025-26",
    title: "Partnership full (SA104F)",
    filename: "SA104F_2026.pdf",
    kind: "supplement",
    attachRule: "partnership",
  },
  {
    formCode: "SA105",
    taxYear: "2025-26",
    title: "UK property (SA105)",
    filename: "SA105_2026_v0.1.pdf",
    kind: "supplement",
    attachRule: "uk_property",
  },
  {
    formCode: "SA106",
    taxYear: "2025-26",
    title: "Foreign (SA106)",
    filename: "SA106_2026.pdf",
    kind: "supplement",
    attachRule: "foreign",
  },
  {
    formCode: "SA108",
    taxYear: "2025-26",
    title: "Capital gains (SA108)",
    filename: "SA108-2026.pdf",
    kind: "supplement",
    attachRule: "capital_gains",
  },
  {
    formCode: "SA109",
    taxYear: "2025-26",
    title: "Residence / remittance / domicile (SA109)",
    filename: "SA109-2026.pdf",
    kind: "supplement",
    attachRule: "residence",
  },
] as const;

function ruleMatches(rule: SaFormAttachRule, draft: Sa100Draft): boolean {
  switch (rule) {
    case "employment":
      return draft.hasEmployment;
    case "self_employment":
      return draft.hasSelfEmployment;
    case "partnership":
      return draft.hasPartnership;
    case "uk_property":
      return draft.hasUkProperty;
    case "foreign":
      return draft.hasForeign;
    case "capital_gains":
      return draft.hasCapitalGains;
    case "residence":
      return draft.hasResidenceFig;
    default:
      return false;
  }
}

/** Supplementary pages that must ride with this SA100 for the person's income. */
export function supplementsForDraft(draft: Sa100Draft): SaFormTemplate[] {
  return SA_FORM_CATALOG.filter(
    (f) => f.kind === "supplement" && f.attachRule && ruleMatches(f.attachRule, draft),
  );
}

export function supplementCodesForDraft(draft: Sa100Draft): string[] {
  return supplementsForDraft(draft).map((f) => f.formCode);
}

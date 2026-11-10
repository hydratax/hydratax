/**
 * Official SA800 Partnership Tax Return stationery under public/hmrc/.
 * Filenames match the HMRC CDN names (historically labelled “man” even though
 * these are the 8-page return, not the guide notes).
 */
export type Sa800Template = {
  taxYear: string;
  /** Stationery year printed on the form, e.g. 2026 */
  formYear: number;
  filename: string;
  title: string;
};

export const SA800_TEMPLATES: readonly Sa800Template[] = [
  {
    taxYear: "2025-26",
    formYear: 2026,
    filename: "SA800man-2026.pdf",
    title: "Partnership Tax Return 2026 (SA800)",
  },
  {
    taxYear: "2024-25",
    formYear: 2025,
    filename: "SA800man_2025.pdf",
    title: "Partnership Tax Return 2025 (SA800)",
  },
  {
    taxYear: "2023-24",
    formYear: 2024,
    filename: "SA800man_2024.pdf",
    title: "Partnership Tax Return 2024 (SA800)",
  },
  {
    taxYear: "2022-23",
    formYear: 2023,
    filename: "sa800man_2023.pdf",
    title: "Partnership Tax Return 2023 (SA800)",
  },
] as const;

export function sa800TemplateForTaxYear(taxYear: string): Sa800Template {
  const hit = SA800_TEMPLATES.find((t) => t.taxYear === taxYear);
  if (hit) return hit;
  // Prefer latest stationery when an unknown year is requested.
  return SA800_TEMPLATES[0]!;
}

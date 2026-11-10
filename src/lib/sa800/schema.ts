import { z } from "zod";
import { TAX_YEAR_LABEL } from "@/lib/sa100/rates-2025-26";

const money = z.coerce.number().min(0).default(0);

export const sa800PartnerSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  nino: z.string().default(""),
  /** Profit share percentage (must sum ~100 across partners) */
  sharePct: z.coerce.number().min(0).max(100).default(0),
});

/** Minimal SA800 partnership return draft (entity desk). */
export const sa800DraftSchema = z.object({
  taxYear: z.string().default(TAX_YEAR_LABEL),
  partnershipName: z.string().default(""),
  partnershipUtr: z.string().default(""),
  tradeDescription: z.string().default(""),
  booksFrom: z.string().default(""),
  booksTo: z.string().default(""),
  turnover: money,
  otherIncome: money,
  costOfGoods: money,
  staffCosts: money,
  premisesCosts: money,
  otherExpenses: money,
  partners: z.array(sa800PartnerSchema).default([]),
  declarationName: z.string().default(""),
  declarationCapacity: z.string().default("Partner"),
});

export type Sa800Draft = z.infer<typeof sa800DraftSchema>;
export type Sa800Partner = z.infer<typeof sa800PartnerSchema>;

function newPartner(sharePct: number): Sa800Partner {
  return {
    id: crypto.randomUUID(),
    name: "",
    nino: "",
    sharePct,
  };
}

export function emptySa800Draft(
  partial?: Partial<Sa800Draft>,
): Sa800Draft {
  return sa800DraftSchema.parse({
    taxYear: TAX_YEAR_LABEL,
    partners: [newPartner(50), newPartner(50)],
    ...partial,
  });
}

import type { Sa800Draft } from "@/lib/sa800/schema";

export type Sa800PartnerShare = {
  id: string;
  name: string;
  nino: string;
  sharePct: number;
  profitShare: number;
};

export type Sa800Calculation = {
  totalIncome: number;
  totalExpenses: number;
  profitBeforeAllocation: number;
  partnerShares: Sa800PartnerShare[];
  sharePctTotal: number;
  sharePctBalanced: boolean;
};

export function calculateSa800(draft: Sa800Draft): Sa800Calculation {
  const totalIncome = draft.turnover + draft.otherIncome;
  const totalExpenses =
    draft.costOfGoods +
    draft.staffCosts +
    draft.premisesCosts +
    draft.otherExpenses;
  const profitBeforeAllocation = Math.max(0, totalIncome - totalExpenses);
  const sharePctTotal = draft.partners.reduce((s, p) => s + p.sharePct, 0);
  const partnerShares = draft.partners.map((p) => ({
    id: p.id,
    name: p.name.trim() || "Partner",
    nino: p.nino.trim(),
    sharePct: p.sharePct,
    profitShare:
      sharePctTotal > 0
        ? Math.round(
            ((profitBeforeAllocation * p.sharePct) / sharePctTotal) * 100,
          ) / 100
        : 0,
  }));

  return {
    totalIncome,
    totalExpenses,
    profitBeforeAllocation,
    partnerShares,
    sharePctTotal,
    sharePctBalanced: Math.abs(sharePctTotal - 100) < 0.05,
  };
}

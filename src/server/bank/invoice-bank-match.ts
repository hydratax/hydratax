/**
 * Deterministic invoice ↔ bank reconciliation suggestions (no LLM).
 * Match on amount + date window + shared reference tokens.
 */

export type InvoiceMatchInput = {
  id: string;
  invoiceNumber: string;
  totalPence: number;
  issueDate: string;
  dueDate: string;
  reference: string | null;
  status: string;
};

export type BankMatchInput = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
};

export type InvoiceBankSuggestion = {
  invoiceId: string;
  bankTransactionId: string;
  score: number;
  reason: string;
};

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso.slice(0, 10));
  const b = Date.parse(bIso.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.abs(Math.round((a - b) / 86_400_000));
}

function tokens(raw: string): Set<string> {
  return new Set(
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

/**
 * Suggest bank credits that likely settle open invoices.
 */
export function suggestInvoiceBankMatches(
  invoices: InvoiceMatchInput[],
  bank: BankMatchInput[],
): InvoiceBankSuggestion[] {
  const open = invoices.filter(
    (i) => i.status !== "paid" && i.status !== "void" && i.totalPence > 0,
  );
  const credits = bank.filter((b) => b.amountPence > 0);
  const usedBank = new Set<string>();
  const out: InvoiceBankSuggestion[] = [];

  for (const inv of open) {
    let best: InvoiceBankSuggestion | null = null;
    const invTokens = tokens(
      `${inv.invoiceNumber} ${inv.reference ?? ""}`,
    );
    for (const tx of credits) {
      if (usedBank.has(tx.id)) continue;
      if (Math.abs(tx.amountPence - inv.totalPence) > 1) continue;

      const fromIssue = daysBetween(tx.dated, inv.issueDate);
      const fromDue = daysBetween(tx.dated, inv.dueDate);
      const dateGap = Math.min(fromIssue, fromDue);
      if (dateGap > 45) continue;

      let score = 40;
      const reasons: string[] = ["amount match"];
      if (dateGap <= 7) {
        score += 30;
        reasons.push("within 7 days");
      } else if (dateGap <= 21) {
        score += 15;
        reasons.push("within 21 days");
      }

      const descTokens = tokens(tx.description);
      let overlap = 0;
      for (const t of invTokens) {
        if (descTokens.has(t)) overlap += 1;
      }
      if (inv.invoiceNumber && tx.description.toLowerCase().includes(inv.invoiceNumber.toLowerCase())) {
        score += 40;
        reasons.push("invoice number in narrative");
      } else if (overlap > 0) {
        score += 15 * overlap;
        reasons.push("shared reference");
      }

      if (!best || score > best.score) {
        best = {
          invoiceId: inv.id,
          bankTransactionId: tx.id,
          score,
          reason: reasons.join(", "),
        };
      }
    }
    if (best && best.score >= 55) {
      usedBank.add(best.bankTransactionId);
      out.push(best);
    }
  }

  return out.sort((a, b) => b.score - a.score);
}

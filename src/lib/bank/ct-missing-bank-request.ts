/** Portal checklist ids for company (CT) missing-bank statement chases. */

export function ctMissingBankRequestId(
  clientId: string,
  periodStart: string,
  periodEnd: string,
): string {
  return `ct-bank-${clientId}-${periodStart}-${periodEnd}`;
}

export function parseCtMissingBankRequestId(requestId: string): {
  clientId: string;
  periodStart: string;
  periodEnd: string;
} | null {
  const m =
    /^ct-bank-(.+)-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/.exec(requestId);
  if (!m) return null;
  return {
    clientId: m[1]!,
    periodStart: m[2]!,
    periodEnd: m[3]!,
  };
}

/** Portal checklist ids for SA missing-bank statement chases (not server actions). */

export function saMissingBankRequestId(
  taxpayerId: string,
  taxYear: string,
): string {
  return `sa-bank-${taxpayerId}-${taxYear}`;
}

export function parseSaMissingBankRequestId(requestId: string): {
  taxpayerId: string;
  taxYear: string;
} | null {
  const m = /^sa-bank-(.+)-(\d{4}-\d{2})$/.exec(requestId);
  if (!m) return null;
  return { taxpayerId: m[1]!, taxYear: m[2]! };
}

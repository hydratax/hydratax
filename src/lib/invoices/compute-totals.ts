/** Shared invoice total maths (pence). Discount is off net before VAT is kept as line-sum. */

export type InvoiceTotalsInput = {
  lineNetPence: number;
  lineVatPence: number;
  discountPence?: number;
  /** If set and discountPence is 0, compute discount from net × bps / 10_000 */
  discountPercentBps?: number | null;
  shippingPence?: number;
  adjustmentPence?: number;
};

export function computeInvoiceTotals(input: InvoiceTotalsInput) {
  const subtotalPence = Math.max(0, Math.round(input.lineNetPence));
  const vatPence = Math.max(0, Math.round(input.lineVatPence));
  let discountPence = Math.max(0, Math.round(input.discountPence ?? 0));
  if (
    discountPence === 0 &&
    input.discountPercentBps != null &&
    input.discountPercentBps > 0
  ) {
    discountPence = Math.round(
      (subtotalPence * input.discountPercentBps) / 10_000,
    );
  }
  discountPence = Math.min(discountPence, subtotalPence);
  const shippingPence = Math.round(input.shippingPence ?? 0);
  const adjustmentPence = Math.round(input.adjustmentPence ?? 0);
  const totalPence = Math.max(
    0,
    subtotalPence - discountPence + shippingPence + adjustmentPence + vatPence,
  );
  return {
    subtotalPence,
    vatPence,
    discountPence,
    shippingPence,
    adjustmentPence,
    totalPence,
  };
}

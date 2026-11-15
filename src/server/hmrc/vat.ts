import { z } from "zod";
import { penceSchema, vatReturnBoxesSchema } from "@/server/money/schemas";
import { pence, penceToPounds, type Pence } from "@/server/money/pence";
import { hmrcFetch } from "./client";
import type { FraudHeaderMap } from "./fraud-headers";

export const vatObligationSchema = z.object({
  periodKey: z.string(),
  start: z.string(),
  end: z.string(),
  due: z.string(),
  status: z.string(),
  received: z.string().optional(),
});

export type VatBoxes = z.infer<typeof vatReturnBoxesSchema>;

/**
 * HMRC box identities (VAT (MTD) API):
 * Box 3 = Box 1 + Box 2; Box 5 = |Box 3 − Box 4| (always ≥ 0).
 */
export function assertVatBoxIdentities(boxes: VatBoxes): void {
  const b1 = Number(boxes.vatDueSales);
  const b2 = Number(boxes.vatDueAcquisitions);
  const b3 = Number(boxes.totalVatDue);
  const b4 = Number(boxes.vatReclaimedCurrPeriod);
  const b5 = Number(boxes.netVatDue);
  if (b3 !== b1 + b2) {
    throw new Error(
      `VAT Box 3 must equal Box 1 + Box 2 (got ${b3}, expected ${b1 + b2}).`,
    );
  }
  const expectedNet = Math.abs(b3 - b4);
  if (b5 !== expectedNet) {
    throw new Error(
      `VAT Box 5 must equal |Box 3 − Box 4| (got ${b5}, expected ${expectedNet}).`,
    );
  }
  if (b5 < 0) {
    throw new Error("VAT Box 5 (netVatDue) must be zero or positive.");
  }
}

/** HMRC VAT return JSON uses pounds as numbers with up to 2dp for boxes 1–5, whole pounds for 6–9. */
export function boxesToHmrcPayload(boxes: VatBoxes) {
  const validated = vatReturnBoxesSchema.parse(boxes);
  assertVatBoxIdentities(validated);
  return {
    periodKey: undefined as string | undefined,
    vatDueSales: Number(penceToPounds(validated.vatDueSales)),
    vatDueAcquisitions: Number(penceToPounds(validated.vatDueAcquisitions)),
    totalVatDue: Number(penceToPounds(validated.totalVatDue)),
    vatReclaimedCurrPeriod: Number(
      penceToPounds(validated.vatReclaimedCurrPeriod),
    ),
    netVatDue: Number(penceToPounds(validated.netVatDue)),
    totalValueSalesExVAT: Math.round(Number(validated.totalValueSalesExVAT) / 100),
    totalValuePurchasesExVAT: Math.round(
      Number(validated.totalValuePurchasesExVAT) / 100,
    ),
    totalValueGoodsSuppliedExVAT: Math.round(
      Number(validated.totalValueGoodsSuppliedExVAT) / 100,
    ),
    totalAcquisitionsExVAT: Math.round(
      Number(validated.totalAcquisitionsExVAT) / 100,
    ),
    finalised: true,
  };
}

export type LedgerLine = {
  type: "income" | "expense";
  amountPence: number;
  vatPence: number;
  dated: string;
};

export function draftVatBoxesFromLedger(
  lines: LedgerLine[],
  periodStart: string,
  periodEnd: string,
): VatBoxes {
  const inPeriod = lines.filter(
    (l) => l.dated >= periodStart && l.dated <= periodEnd,
  );

  let box1 = 0;
  let box4 = 0;
  let box6 = 0;
  let box7 = 0;

  for (const line of inPeriod) {
    if (line.type === "income") {
      box1 += line.vatPence;
      box6 += line.amountPence;
    } else {
      box4 += line.vatPence;
      box7 += line.amountPence;
    }
  }

  const vatDueSales = pence(box1);
  const vatDueAcquisitions = pence(0);
  const totalVatDue = pence(box1 + 0);
  const vatReclaimed = pence(box4);
  const net = pence(Math.abs(box1 - box4));

  return vatReturnBoxesSchema.parse({
    vatDueSales,
    vatDueAcquisitions,
    totalVatDue,
    vatReclaimedCurrPeriod: vatReclaimed,
    netVatDue: net,
    totalValueSalesExVAT: pence(box6),
    totalValuePurchasesExVAT: pence(box7),
    totalValueGoodsSuppliedExVAT: pence(0),
    totalAcquisitionsExVAT: pence(0),
  });
}

export async function fetchVatObligations(opts: {
  vrn: string;
  accessToken: string;
  fraudHeaders: FraudHeaderMap;
  actorId: string;
  clientId: string;
  practiceId?: string;
  /** Inclusive range required by HMRC VAT obligations endpoint */
  from: string;
  to: string;
  status?: "O" | "F";
}) {
  const params = new URLSearchParams({
    from: opts.from,
    to: opts.to,
  });
  if (opts.status) params.set("status", opts.status);

  return hmrcFetch<{ obligations: Array<z.infer<typeof vatObligationSchema>> }>(
    {
      path: `/organisations/vat/${encodeURIComponent(opts.vrn)}/obligations?${params}`,
      accessToken: opts.accessToken,
      fraudHeaders: opts.fraudHeaders,
      actorId: opts.actorId,
      clientId: opts.clientId,
      practiceId: opts.practiceId,
      action: "hmrc.vat.obligations",
    },
  );
}

export async function submitVatReturn(opts: {
  vrn: string;
  periodKey: string;
  boxes: VatBoxes;
  accessToken: string;
  fraudHeaders: FraudHeaderMap;
  actorId: string;
  clientId: string;
  practiceId?: string;
}) {
  const payload = boxesToHmrcPayload(opts.boxes);
  payload.periodKey = opts.periodKey;
  // periodKey may contain '#' — encode path segment only
  const vrn = encodeURIComponent(opts.vrn);

  return hmrcFetch({
    method: "POST",
    path: `/organisations/vat/${vrn}/returns`,
    accessToken: opts.accessToken,
    fraudHeaders: opts.fraudHeaders,
    body: payload,
    actorId: opts.actorId,
    clientId: opts.clientId,
    practiceId: opts.practiceId,
    action: "hmrc.vat.submit",
  });
}

export const vatSubmitInputSchema = z.object({
  clientId: z.string().min(1),
  periodKey: z.string().min(1),
  periodStart: z.string(),
  periodEnd: z.string(),
  boxes: vatReturnBoxesSchema.optional(),
  fraudMetadata: z.record(z.string()),
});

export type { Pence };
export { penceSchema };

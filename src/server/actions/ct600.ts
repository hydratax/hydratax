"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "./clients";
import { isDemoMode } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { ct600FiguresSchema } from "@/server/money/schemas";
import { poundsToPence } from "@/server/money/pence";
import {
  buildCt600Xml,
  computeTaxableProfit,
  submitCt600Xml,
} from "@/server/hmrc/ct600";
import { appendAuditEvent } from "@/server/audit/log";

const figuresFormSchema = z.object({
  clientId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  turnoverPounds: z.string(),
  costOfSalesPounds: z.string().default("0"),
  administrativeExpensesPounds: z.string().default("0"),
  otherIncomePounds: z.string().default("0"),
  tangibleAssetsPounds: z.string().default("0"),
  cashAtBankPounds: z.string().default("0"),
  debtorsPounds: z.string().default("0"),
  creditorsPounds: z.string().default("0"),
  calledUpShareCapitalPounds: z.string().default("0"),
  profitAndLossAccountPounds: z.string().default("0"),
});

function formToFigures(data: z.infer<typeof figuresFormSchema>) {
  return ct600FiguresSchema.parse({
    clientId: data.clientId,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    turnoverPence: poundsToPence(data.turnoverPounds),
    costOfSalesPence: poundsToPence(data.costOfSalesPounds),
    administrativeExpensesPence: poundsToPence(
      data.administrativeExpensesPounds,
    ),
    otherIncomePence: poundsToPence(data.otherIncomePounds),
    tangibleAssetsPence: poundsToPence(data.tangibleAssetsPounds),
    cashAtBankPence: poundsToPence(data.cashAtBankPounds),
    debtorsPence: poundsToPence(data.debtorsPounds),
    creditorsPence: poundsToPence(data.creditorsPounds),
    calledUpShareCapitalPence: poundsToPence(data.calledUpShareCapitalPounds),
    profitAndLossAccountPence: poundsToPence(data.profitAndLossAccountPounds),
  });
}

export async function prepareCt600(input: z.infer<typeof figuresFormSchema>) {
  const session = await requireSession();
  const data = figuresFormSchema.parse(input);
  const client = await getClient(data.clientId);
  if (client.type !== "limited_company") {
    throw new Error("CT600 is only for limited companies");
  }
  if (!client.companyNumber || !client.utr) {
    throw new Error("Company number and UTR are required");
  }

  const figures = formToFigures(data);
  const built = buildCt600Xml({
    companyName: client.name,
    companyNumber: client.companyNumber,
    utr: client.utr,
    figures,
  });

  const draft = {
    id: crypto.randomUUID(),
    clientId: data.clientId,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    status: "ready",
    figures,
    taxableProfitPence: built.taxableProfitPence,
    xmlPayloadHash: built.hash,
    createdAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    demoStore.ct600Returns.push(draft);
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "ct600.prepare",
    entityType: "ct600_return",
    entityId: draft.id,
    payloadHash: built.hash,
    detail: {
      taxableProfitPence: built.taxableProfitPence,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    },
  });

  revalidatePath(`/clients/${data.clientId}/corporation-tax`);
  return { draft, xmlPreview: built.xml.slice(0, 1500) };
}

export async function listCt600Returns(clientId: string) {
  await getClient(clientId);
  if (isDemoMode()) {
    return demoStore.ct600Returns.filter((r) => r.clientId === clientId);
  }
  const { getDb } = await import("@/server/db");
  const { ct600Returns } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  return getDb()
    .select()
    .from(ct600Returns)
    .where(eq(ct600Returns.clientId, clientId));
}

export async function submitCt600(returnId: string, clientId: string) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (!client.companyNumber || !client.utr) {
    throw new Error("Company number and UTR are required");
  }

  let draft = isDemoMode()
    ? demoStore.ct600Returns.find((r) => r.id === returnId)
    : null;

  if (!draft) throw new Error("CT600 draft not found");

  const figures = ct600FiguresSchema.parse(draft.figures);
  const built = buildCt600Xml({
    companyName: client.name,
    companyNumber: client.companyNumber,
    utr: client.utr,
    figures,
  });

  const res = await submitCt600Xml({
    xml: built.xml,
    actorId: session.userId,
    clientId,
    practiceId: session.practiceId,
    demo: isDemoMode() || !getHmrcClientId(),
  });

  if (isDemoMode()) {
    const idx = demoStore.ct600Returns.findIndex((r) => r.id === returnId);
    if (idx >= 0) {
      demoStore.ct600Returns[idx] = {
        ...draft,
        status: res.ok ? "accepted" : "rejected",
        xmlPayloadHash: built.hash,
        hmrcCorrelationId: res.correlationId,
        hmrcReceipt: res.receipt,
        submittedAt: new Date().toISOString(),
        taxableProfitPence: computeTaxableProfit(figures),
      };
      draft = demoStore.ct600Returns[idx];
    }
  }

  revalidatePath(`/clients/${clientId}/corporation-tax`);
  return { draft, res };
}

function getHmrcClientId() {
  return process.env.HMRC_CLIENT_ID;
}

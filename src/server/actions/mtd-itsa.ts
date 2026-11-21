"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { getSa100Draft, saveSa100Draft } from "@/server/actions/sa100";
import {
  SA103F_HEAD_META,
  type SaSelfEmploymentMoneyField,
} from "@/server/bank/sa-box-map";
import {
  emptySa100Draft,
  seExpensesBreakdownTotal,
  type Sa100Draft,
} from "@/lib/sa100/schema";

const allowedFields = new Set(
  SA103F_HEAD_META.map((m) => m.field as string),
);

const schema = z.object({
  clientId: z.string().min(1),
  taxpayerId: z.string().min(1),
  taxYear: z.string().regex(/^\d{4}-\d{2}$/),
  figures: z.record(z.string(), z.number().finite()),
});

/**
 * Apply MTD for Income Tax quarterly / bridging figures onto the SA100 draft
 * (SA103F self-employment boxes). Cumulative year-to-date pounds.
 */
export async function applyMtdItsaFiguresToSa100(
  input: z.infer<typeof schema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = schema.parse(input);
  await getClient(data.clientId);

  const figures: Partial<Record<SaSelfEmploymentMoneyField, number>> = {};
  for (const [field, pounds] of Object.entries(data.figures)) {
    if (!allowedFields.has(field)) continue;
    figures[field as SaSelfEmploymentMoneyField] = pounds;
  }
  if (!Object.keys(figures).length) {
    return { ok: false as const, error: "No recognised SA103F fields in file" };
  }

  const existing = await getSa100Draft(
    data.clientId,
    data.taxYear,
    data.taxpayerId,
  );
  let draft: Sa100Draft =
    existing?.draft ?? emptySa100Draft({ taxYear: data.taxYear });
  draft = { ...draft, taxYear: data.taxYear, hasSelfEmployment: true };

  for (const [field, pounds] of Object.entries(figures)) {
    (draft as Record<string, unknown>)[field] = pounds;
  }
  draft.seExpenses = seExpensesBreakdownTotal(draft);

  const saved = await saveSa100Draft({
    clientId: data.clientId,
    taxpayerId: data.taxpayerId,
    draft,
    skipPdfs: true,
  });

  revalidatePath(`/clients/${data.clientId}/self-assessment`);
  revalidatePath("/self-assessment");

  return {
    ok: true as const,
    filledCount: Object.keys(figures).length,
    returnId: saved.id,
  };
}

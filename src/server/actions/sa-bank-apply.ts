"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { listBankTransactions } from "@/server/actions/bank";
import {
  bankCategoryToSaField,
  isSaIncomeHead,
  mapBankHeadsToSaSelfEmployment,
  resolveAllocateTarget,
  sa103fHeadLabel,
  type SaAllocateForm,
  type SaSelfEmploymentMoneyField,
  SA_ALLOCATE_FORM_LABEL,
  SA103F_HEAD_META,
} from "@/server/bank/sa-box-map";
import {
  parseSaTaxYearLabel,
  saTaxYearContainingDate,
} from "@/lib/sa-tax-year";
import type { Sa100Draft } from "@/lib/sa100/schema";

const formEnum = z.enum(["sa103f", "sa105", "sa102"]);

const applySchema = z.object({
  clientId: z.string().min(1),
  taxpayerId: z.string().min(1),
  taxYear: z.string().regex(/^\d{4}-\d{2}$/),
  /** Bank head identity (SA103F field key from the categoriser map). */
  field: z.string().min(1),
  /** Which supplementary form to write into (accountant override). */
  form: formEnum.default("sa103f"),
  /** AR1–AR5 revision; default original draft. */
  amendmentIndex: z.number().int().min(0).max(5).optional(),
});

const bulkSchema = z.object({
  clientId: z.string().min(1),
  taxpayerId: z.string().min(1),
  taxYear: z.string().regex(/^\d{4}-\d{2}$/),
  amendmentIndex: z.number().int().min(0).max(5).optional(),
  heads: z
    .array(
      z.object({
        field: z.string().min(1),
        form: formEnum,
      }),
    )
    .min(1)
    .max(40),
});

type HeadApply = {
  field: SaSelfEmploymentMoneyField;
  form: SaAllocateForm;
};

function applyOneHeadToDraft(
  draft: Sa100Draft,
  field: SaSelfEmploymentMoneyField,
  form: SaAllocateForm,
  pounds: number,
  seExpensesBreakdownTotal: (d: Sa100Draft) => number,
  employmentRowSchema: {
    parse: (v: unknown) => Sa100Draft["employments"][number];
  },
): Sa100Draft {
  const target = resolveAllocateTarget(form, field);
  if (form === "sa103f") {
    const next = {
      ...draft,
      hasSelfEmployment: true,
      [field]: pounds,
    } as Sa100Draft;
    next.seExpenses = seExpensesBreakdownTotal(next);
    return next;
  }
  if (form === "sa105") {
    return {
      ...draft,
      hasUkProperty: true,
      [target.draftKey]: pounds,
    } as Sa100Draft;
  }
  const rows = [...(draft.employments ?? [])];
  const row = employmentRowSchema.parse(rows[0] ?? {});
  const key = target.draftKey;
  if (key === "pay") row.pay = pounds;
  else if (key === "tips") row.tips = pounds;
  else if (key === "expenseTravel") row.expenseTravel = pounds;
  else if (key === "expenseProfessional") row.expenseProfessional = pounds;
  else row.expenseOther = pounds;
  if (!rows.length) rows.push(row);
  else rows[0] = row;
  return {
    ...draft,
    hasEmployment: true,
    employmentCount: Math.max(draft.employmentCount || 0, rows.length),
    employments: rows,
  };
}

/**
 * bankbee — set one SA money box from bank lines in that tax year
 * for the given head. Form defaults to SA103F; SA105 / SA102 when chosen.
 */
export async function applyBankSaHeadToReturn(
  input: z.infer<typeof applySchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }

  const data = applySchema.parse(input);
  const bulk = await applyBankSaHeadsBulk({
    clientId: data.clientId,
    taxpayerId: data.taxpayerId,
    taxYear: data.taxYear,
    amendmentIndex: data.amendmentIndex,
    heads: [{ field: data.field, form: data.form }],
  });
  if (!bulk.ok) return bulk;
  const one = bulk.allocated[0];
  return {
    ok: true as const,
    message: bulk.message,
    pounds: one?.pounds ?? 0,
    lineCount: one?.lineCount ?? 0,
    taxYear: data.taxYear,
    field: data.field,
    form: data.form as SaAllocateForm,
    incomeHead: isSaIncomeHead(data.field as SaSelfEmploymentMoneyField),
  };
}

/**
 * bankbee — allocate many heads in one draft save (skips “Keep unallocated”
 * on the client before calling).
 */
export async function applyBankSaHeadsBulk(
  input: z.infer<typeof bulkSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }

  const data = bulkSchema.parse(input);
  const year = parseSaTaxYearLabel(data.taxYear);
  if (!year) return { ok: false as const, error: "Invalid tax year." };

  const heads: HeadApply[] = [];
  for (const h of data.heads) {
    const field = h.field as SaSelfEmploymentMoneyField;
    if (!SA103F_HEAD_META.some((m) => m.field === field)) {
      return { ok: false as const, error: `Unknown bank head: ${h.field}` };
    }
    heads.push({ field, form: h.form });
  }

  await getClient(data.clientId);
  const txs = await listBankTransactions(data.clientId);
  const inYear = txs.filter((t) => {
    const y = saTaxYearContainingDate(t.dated);
    return y?.label === data.taxYear;
  });

  const { getSa100Draft, saveSa100Draft } = await import(
    "@/server/actions/sa100"
  );
  const {
    emptySa100Draft,
    employmentRowSchema,
    seExpensesBreakdownTotal,
  } = await import("@/lib/sa100/schema");

  const amendmentIndex = Number(data.amendmentIndex) || 0;
  const existing = await getSa100Draft(
    data.clientId,
    data.taxYear,
    data.taxpayerId,
    amendmentIndex,
  );
  if (
    existing?.locked ||
    existing?.status === "submitted" ||
    existing?.status === "accepted"
  ) {
    return {
      ok: false as const,
      error: "This return is locked. Use Amend Return to allocate on an AR draft.",
    };
  }
  let nextDraft: Sa100Draft =
    existing?.draft ?? emptySa100Draft({ taxYear: data.taxYear });
  nextDraft = { ...nextDraft, taxYear: data.taxYear };

  const allocated: Array<{
    field: string;
    form: SaAllocateForm;
    pounds: number;
    lineCount: number;
    boxLabel: string;
  }> = [];
  const skipped: string[] = [];

  for (const { field, form } of heads) {
    const forHead = inYear.filter(
      (t) => bankCategoryToSaField(t.category) === field,
    );
    if (!forHead.length) {
      skipped.push(sa103fHeadLabel(field));
      continue;
    }
    const mapped = mapBankHeadsToSaSelfEmployment(forHead);
    const pounds = mapped.fields[field];
    if (pounds == null) {
      skipped.push(sa103fHeadLabel(field));
      continue;
    }
    const target = resolveAllocateTarget(form, field);
    nextDraft = applyOneHeadToDraft(
      nextDraft,
      field,
      form,
      pounds,
      seExpensesBreakdownTotal,
      employmentRowSchema,
    );
    allocated.push({
      field,
      form,
      pounds,
      lineCount: forHead.length,
      boxLabel: target.boxLabel,
    });
  }

  if (!allocated.length) {
    return {
      ok: false as const,
      error: skipped.length
        ? `Nothing to allocate (${skipped.join("; ")}).`
        : "Nothing to allocate.",
    };
  }

  await saveSa100Draft({
    clientId: data.clientId,
    taxpayerId: data.taxpayerId,
    draft: nextDraft as never,
    amendmentIndex,
    skipPdfs: true,
  });

  revalidatePath(`/clients/${data.clientId}/self-assessment`);
  revalidatePath(`/self-assessment`);

  const summary =
    allocated.length === 1
      ? `Allocated ${allocated[0]!.boxLabel} · £${allocated[0]!.pounds.toFixed(2)} to ${SA_ALLOCATE_FORM_LABEL[allocated[0]!.form]} for ${data.taxYear}.`
      : `Allocated ${allocated.length} heads to their forms for ${data.taxYear}.`;

  return {
    ok: true as const,
    message:
      skipped.length > 0
        ? `${summary} Skipped: ${skipped.join("; ")}.`
        : summary,
    allocated,
    skipped,
    taxYear: data.taxYear,
  };
}

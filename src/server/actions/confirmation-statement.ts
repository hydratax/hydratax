"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import {
  createCsFilingDraft,
  getCsFiling,
  getCsFilingReadiness,
  submitCsFiling,
} from "@/server/companies-house/filing/confirmation-statement";

export async function getConfirmationStatementFilingReadiness() {
  return getCsFilingReadiness();
}

export async function prepareConfirmationStatementFiling(input: unknown) {
  await requireSession();
  const result = await createCsFilingDraft(input);
  if (result.ok) {
    revalidatePath("/companies-house/confirmation-statement");
  }
  return result;
}

export async function fileConfirmationStatement(
  filingId: string,
  opts?: { dryRun?: boolean },
) {
  await requireSession();
  const result = await submitCsFiling(filingId, opts);
  if (result.ok) {
    revalidatePath("/companies-house/confirmation-statement");
    if (result.status === "submitted") {
      revalidatePath("/admin/companies-house");
    }
  }
  return result;
}

export async function loadConfirmationStatementFiling(filingId: string) {
  await requireSession();
  return getCsFiling(filingId);
}

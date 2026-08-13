"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/auth/session";
import {
  createIncorporationDraft,
  getIncorporationFiling,
  getIncorporationFilingReadiness,
  submitIncorporationFiling,
} from "@/server/companies-house/filing/incorporation";

export async function getIncorporationReadiness() {
  return getIncorporationFilingReadiness();
}

export async function prepareIncorporationFiling(input: unknown) {
  await requireSession();
  const result = await createIncorporationDraft(input);
  if (result.ok) {
    revalidatePath("/companies-house/incorporation");
    revalidatePath("/companies-house/incorporation-same-day");
  }
  return result;
}

export async function fileIncorporation(
  filingId: string,
  opts?: { dryRun?: boolean },
) {
  await requireSession();
  const result = await submitIncorporationFiling(filingId, opts);
  if (result.ok) {
    revalidatePath("/companies-house/incorporation");
    revalidatePath("/companies-house/incorporation-same-day");
    if (result.status === "submitted") {
      revalidatePath("/admin/companies-house");
    }
  }
  return result;
}

export async function loadIncorporationFiling(filingId: string) {
  await requireSession();
  return getIncorporationFiling(filingId);
}

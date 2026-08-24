"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import {
  deskCreateCustomBankCategory,
  deskListCustomBankCategories,
} from "@/server/db/desk-store";
import { customCategoryId } from "@/lib/bank-categories";

export type CustomCategoryRow = { id: string; label: string };

export async function listCustomBankCategories(): Promise<CustomCategoryRow[]> {
  const session = await requireSession();
  return deskListCustomBankCategories(session.practiceId);
}

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  clientId: z.string().optional(),
});

export async function createCustomBankCategory(
  input: z.infer<typeof createSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }
  const data = createSchema.parse(input);
  const row = await deskCreateCustomBankCategory(
    session.practiceId,
    data.label,
  );
  if (data.clientId) {
    revalidatePath(`/clients/${data.clientId}/bank`);
    revalidatePath(`/clients/${data.clientId}/accounts-pack`);
  }
  return {
    ok: true as const,
    id: customCategoryId(row.id),
    label: row.label,
  };
}

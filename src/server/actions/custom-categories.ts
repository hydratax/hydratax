"use server";
import { safeErr } from "@/lib/redact";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { deskListCustomBankCategories } from "@/server/db/desk-store";
import { customCategoryId } from "@/lib/bank-categories";

export type CustomCategoryRow = { id: string; label: string };

export async function listCustomBankCategories(): Promise<CustomCategoryRow[]> {
  const session = await requireSession();
  const { isMemoryStore } = await import("@/lib/env");
  if (isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    return memoryStore.customBankCategories
      .filter((c) => c.practiceId === session.practiceId)
      .map((c) => ({ id: c.id, label: c.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  return deskListCustomBankCategories(session.practiceId);
}

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  clientId: z.string().optional(),
});

export async function createCustomBankCategory(
  input: z.infer<typeof createSchema>,
) {
  try {
    const session = await requireSession();
    if (session.role === "readonly") {
      return { ok: false as const, error: "Read-only access." };
    }
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false as const,
        error: parsed.error.issues[0]?.message ?? "Invalid category name.",
      };
    }
    const data = parsed.data;
    const { isMemoryStore } = await import("@/lib/env");
    let row: { id: string; label: string };
    if (isMemoryStore()) {
      const { memoryStore } = await import("@/server/demo/store");
      const hit = memoryStore.customBankCategories.find(
        (c) =>
          c.practiceId === session.practiceId &&
          c.label.toLowerCase() === data.label.toLowerCase(),
      );
      if (hit) {
        row = { id: hit.id, label: hit.label };
      } else {
        row = {
          id: crypto.randomUUID(),
          label: data.label,
        };
        memoryStore.customBankCategories.push({
          ...row,
          practiceId: session.practiceId,
        });
      }
    } else {
      const { deskFindOrCreateCustomBankCategory } = await import(
        "@/server/db/desk-store"
      );
      row = await deskFindOrCreateCustomBankCategory(
        session.practiceId,
        data.label,
      );
    }
    if (data.clientId) {
      revalidatePath(`/clients/${data.clientId}/bank`);
      revalidatePath(`/clients/${data.clientId}/accounts-pack`);
    }
    return {
      ok: true as const,
      id: customCategoryId(row.id),
      label: row.label,
    };
  } catch (err) {
    console.error("[custom-categories] create failed", safeErr(err));
    return {
      ok: false as const,
      error:
        err instanceof Error ? err.message : "Could not save custom category.",
    };
  }
}

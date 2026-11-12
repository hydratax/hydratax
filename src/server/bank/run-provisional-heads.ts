import { isMemoryStore } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import {
  applyProvisionalHeads,
  type ProvisionalHeadCreated,
} from "@/server/bank/provisional-heads";
import { invalidateMerchantIdentifierCache } from "@/server/bank/merchant-identifiers";
import {
  deskFindOrCreateCustomBankCategory,
  deskListCustomBankCategories,
  deskUpsertMerchantIdentifier,
  isDeskStoreConfigured,
} from "@/server/db/desk-store";

type Line = {
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

/**
 * After merchant rules: spawn Review: heads for material unknown clusters.
 */
export async function runProvisionalHeadsOnLines<T extends Line>(
  lines: T[],
  practiceId: string,
): Promise<{ lines: T[]; created: ProvisionalHeadCreated[] }> {
  if (!lines.length) return { lines, created: [] };

  if (isMemoryStore()) {
    const forPractice = memoryStore.customBankCategories.filter(
      (c) => c.practiceId === practiceId,
    );
    return applyProvisionalHeads(lines, {
      existingLabels: forPractice,
      ensureCategory: async (label) => {
        const hit = memoryStore.customBankCategories.find(
          (c) =>
            c.practiceId === practiceId &&
            c.label.toLowerCase() === label.toLowerCase(),
        );
        if (hit) return { id: hit.id, label: hit.label };
        const row = {
          id: crypto.randomUUID(),
          label,
          practiceId,
        };
        memoryStore.customBankCategories.push(row);
        return { id: row.id, label: row.label };
      },
    });
  }

  if (!isDeskStoreConfigured()) {
    return { lines, created: [] };
  }

  const existingLabels = await deskListCustomBankCategories(practiceId);
  return applyProvisionalHeads(lines, {
    existingLabels,
    ensureCategory: (label) =>
      deskFindOrCreateCustomBankCategory(practiceId, label),
    upsertIdentifier: async ({ pattern, category, label }) => {
      await deskUpsertMerchantIdentifier({
        practiceId,
        pattern,
        category,
        label,
        priority: 20,
      });
      invalidateMerchantIdentifierCache();
    },
  });
}

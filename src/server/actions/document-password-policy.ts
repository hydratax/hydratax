"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import {
  DOCUMENT_PASSWORD_SECTIONS,
  defaultDocumentPasswordPolicy,
  normalizeDocumentPasswordPolicy,
  type DocumentPasswordIdentifier,
  type DocumentPasswordPolicy,
  type DocumentPasswordSection,
} from "@/lib/document-password-policy";
import { requireSession } from "@/server/auth/session";
import { memoryStore } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";

const identifierSchema = z.enum([
  "none",
  "date_of_birth",
  "personal_utr",
  "company_utr",
  "nino",
  "company_number",
]);

const policySchema = z.object({
  sa: identifierSchema,
  ct: identifierSchema,
  accounts: identifierSchema,
  vat: identifierSchema,
  payroll: identifierSchema,
  letters: identifierSchema,
  invoices: identifierSchema,
});

type StoreShape = {
  documentPasswordPolicies?: Record<string, DocumentPasswordPolicy>;
};

export async function getDocumentPasswordPolicy(): Promise<DocumentPasswordPolicy> {
  const session = await requireSession();

  if (isMemoryStore() || isDemoMode()) {
    const store = memoryStore as StoreShape;
    return normalizeDocumentPasswordPolicy(
      store.documentPasswordPolicies?.[session.practiceId],
    );
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("practices")
      .select("document_password_policy")
      .eq("id", session.practiceId)
      .maybeSingle();
    return normalizeDocumentPasswordPolicy(data?.document_password_policy);
  }

  return defaultDocumentPasswordPolicy();
}

export async function saveDocumentPasswordPolicy(
  input: z.infer<typeof policySchema>,
): Promise<DocumentPasswordPolicy> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const policy = policySchema.parse(input);

  if (isMemoryStore() || isDemoMode()) {
    const store = memoryStore as StoreShape;
    store.documentPasswordPolicies ??= {};
    store.documentPasswordPolicies[session.practiceId] = policy;
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase
      .from("practices")
      .update({ document_password_policy: policy })
      .eq("id", session.practiceId);
    if (error) {
      const store = memoryStore as StoreShape;
      store.documentPasswordPolicies ??= {};
      store.documentPasswordPolicies[session.practiceId] = policy;
      console.warn(
        "[document-password-policy] practices update failed",
        error.message,
      );
    }
  } else {
    const store = memoryStore as StoreShape;
    store.documentPasswordPolicies ??= {};
    store.documentPasswordPolicies[session.practiceId] = policy;
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    actorId: session.userId,
    action: "document_password_policy.updated",
    entityType: "practice",
    entityId: session.practiceId,
    detail: { sections: DOCUMENT_PASSWORD_SECTIONS.map((s) => s.id) },
  }).catch(() => undefined);

  revalidatePath("/settings/password-protection");
  revalidatePath("/clients");
  return policy;
}

export async function identifierForSection(
  section: DocumentPasswordSection,
): Promise<DocumentPasswordIdentifier> {
  const policy = await getDocumentPasswordPolicy();
  return policy[section];
}

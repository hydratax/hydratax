"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import type { PracticeLetterhead } from "@/lib/desk-profile";
import { requireSession } from "@/server/auth/session";
import { memoryStore } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";

const letterheadSchema = z.object({
  practiceName: z.string().min(1).max(200),
  addressLines: z.array(z.string().max(200)).max(8),
  phone: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
  website: z.string().max(200).optional(),
  footerLines: z.array(z.string().max(200)).max(6),
  logoUrl: z.string().max(500).optional(),
});

export async function getPracticeLetterhead(): Promise<PracticeLetterhead> {
  const session = await requireSession();
  if (isMemoryStore() || isDemoMode()) {
    memoryStore.letterheads ??= {};
    return (
      memoryStore.letterheads[session.practiceId] ?? {
        practiceName: session.practiceName,
        addressLines: [],
        footerLines: [
          "This firm is regulated for anti-money laundering purposes.",
        ],
      }
    );
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("practices")
      .select("name, letterhead")
      .eq("id", session.practiceId)
      .maybeSingle();
    const stored = (data?.letterhead as PracticeLetterhead | null) ?? null;
    if (stored?.practiceName) return stored;
    return {
      practiceName: (data?.name as string) ?? session.practiceName,
      addressLines: [],
      footerLines: [
        "This firm is regulated for anti-money laundering purposes.",
      ],
    };
  }

  return {
    practiceName: session.practiceName,
    addressLines: [],
    footerLines: [],
  };
}

export async function savePracticeLetterhead(
  input: z.infer<typeof letterheadSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = letterheadSchema.parse(input);
  const letterhead: PracticeLetterhead = {
    ...data,
    addressLines: data.addressLines.map((l) => l.trim()).filter(Boolean),
    footerLines: data.footerLines.map((l) => l.trim()).filter(Boolean),
    phone: data.phone?.trim() || undefined,
    email: data.email?.trim() || undefined,
    website: data.website?.trim() || undefined,
    logoUrl: data.logoUrl?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  if (isMemoryStore() || isDemoMode()) {
    memoryStore.letterheads ??= {};
    memoryStore.letterheads[session.practiceId] = letterhead;
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase
      .from("practices")
      .update({ letterhead })
      .eq("id", session.practiceId);
    if (error) {
      // Column may not exist yet — keep memory fallback for this session
      memoryStore.letterheads[session.practiceId] = letterhead;
      console.warn("[letterhead] practices.letterhead update failed", error.message);
    }
  } else {
    memoryStore.letterheads[session.practiceId] = letterhead;
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    actorId: session.userId,
    action: "letterhead.updated",
    entityType: "practice",
    entityId: session.practiceId,
    detail: { practiceName: letterhead.practiceName },
  }).catch(() => undefined);

  revalidatePath("/settings/account");
  revalidatePath("/settings/letterhead");
  return letterhead;
}

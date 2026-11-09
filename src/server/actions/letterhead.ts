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
  /** Public URL, signed download path, or (demo) data URL */
  logoUrl: z.string().max(2_500_000).optional(),
  qualification: z.string().max(200).optional(),
  bankName: z.string().max(120).optional(),
  accountName: z.string().max(120).optional(),
  sortCode: z.string().max(20).optional(),
  accountNumber: z.string().max(20).optional(),
  paymentNote: z.string().max(300).optional(),
});

function emptyLetterhead(practiceName: string): PracticeLetterhead {
  return {
    practiceName,
    addressLines: [],
    footerLines: [
      "This firm is regulated for anti-money laundering purposes.",
    ],
  };
}

export async function getPracticeLetterhead(): Promise<PracticeLetterhead> {
  const session = await requireSession();
  if (isMemoryStore() || isDemoMode()) {
    memoryStore.letterheads ??= {};
    return (
      memoryStore.letterheads[session.practiceId] ??
      emptyLetterhead(session.practiceName)
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
    return emptyLetterhead((data?.name as string) ?? session.practiceName);
  }

  return emptyLetterhead(session.practiceName);
}

export async function savePracticeLetterhead(
  input: z.infer<typeof letterheadSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = letterheadSchema.parse(input);
  const trim = (v?: string) => v?.trim() || undefined;
  const letterhead: PracticeLetterhead = {
    practiceName: data.practiceName.trim(),
    addressLines: data.addressLines.map((l) => l.trim()).filter(Boolean),
    footerLines: data.footerLines.map((l) => l.trim()).filter(Boolean),
    phone: trim(data.phone),
    email: trim(data.email),
    website: trim(data.website),
    logoUrl: trim(data.logoUrl),
    qualification: trim(data.qualification),
    bankName: trim(data.bankName),
    accountName: trim(data.accountName),
    sortCode: trim(data.sortCode),
    accountNumber: trim(data.accountNumber),
    paymentNote: trim(data.paymentNote),
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
      memoryStore.letterheads ??= {};
      memoryStore.letterheads[session.practiceId] = letterhead;
      console.warn("[letterhead] practices.letterhead update failed", error.message);
    }
  } else {
    memoryStore.letterheads ??= {};
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
  revalidatePath("/clients");
  return letterhead;
}

const LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Upload a firm logo and return a URL suitable for letterhead / print. */
export async function uploadPracticeLogo(formData: FormData): Promise<{
  logoUrl: string;
}> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a logo image to upload");
  }
  if (file.size > LOGO_MAX_BYTES) {
    throw new Error("Logo must be 2 MB or smaller");
  }
  const contentType = file.type || "application/octet-stream";
  if (contentType && !LOGO_TYPES.has(contentType)) {
    throw new Error("Use PNG, JPG, WebP, GIF or SVG");
  }

  const filename = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const objectKey = `practices/${session.practiceId}/branding/${Date.now()}-${filename}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { isR2Configured, uploadToR2 } = await import("@/server/storage/r2");
  const { isBlobConfigured, isMemoryStore: mem } = await import("@/lib/env");

  let logoUrl: string;
  if (isR2Configured()) {
    const uploaded = await uploadToR2({
      key: objectKey,
      body: buf,
      contentType,
    });
    logoUrl = uploaded.url.startsWith("r2://")
      ? `/api/documents/download?key=${encodeURIComponent(objectKey)}`
      : uploaded.url;
  } else if (isBlobConfigured()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(objectKey, file, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });
    logoUrl = blob.url;
  } else if (mem() || isDemoMode()) {
    logoUrl = `data:${contentType};base64,${buf.toString("base64")}`;
  } else {
    throw new Error(
      "Logo storage is not configured. Set Cloudflare R2 or BLOB_READ_WRITE_TOKEN.",
    );
  }

  const current = await getPracticeLetterhead();
  await savePracticeLetterhead({
    practiceName: current.practiceName,
    addressLines: current.addressLines,
    phone: current.phone,
    email: current.email,
    website: current.website,
    footerLines: current.footerLines,
    logoUrl,
    qualification: current.qualification,
    bankName: current.bankName,
    accountName: current.accountName,
    sortCode: current.sortCode,
    accountNumber: current.accountNumber,
    paymentNote: current.paymentNote,
  });

  return { logoUrl };
}

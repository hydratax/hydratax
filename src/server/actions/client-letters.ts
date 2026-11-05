"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import type { ClientLetterRecord, DeskProfile } from "@/lib/desk-profile";
import {
  LETTER_TEMPLATES,
  mergeLetterBody,
  type LetterTemplateKey,
} from "@/lib/letter-templates";
import { requireSession } from "@/server/auth/session";
import { demoStore } from "@/server/demo/store";
import { getClient } from "@/server/actions/clients";
import { appendAuditEvent } from "@/server/audit/log";
import { getPracticeLetterhead } from "@/server/actions/letterhead";

function mergeProfile(
  current: DeskProfile | null | undefined,
  patch: Partial<DeskProfile>,
): DeskProfile {
  return { ...(current ?? {}), ...patch };
}

async function writeProfile(clientId: string, profile: DeskProfile) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }
  if (session.role === "readonly") throw new Error("Forbidden");

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (!row) throw new Error("Client not found");
    row.deskProfile = profile;
    row.updatedAt = new Date().toISOString();
    return profile;
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .update({
        desk_profile: profile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("practice_id", session.practiceId);
    if (error) throw new Error(error.message);
    return profile;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) throw new Error("Client storage is not configured");
  const { eq, and } = await import("drizzle-orm");
  const { clients } = await import("@/server/db/schema");
  await getDb()
    .update(clients)
    .set({ deskProfile: profile, updatedAt: new Date() })
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    );
  return profile;
}

export async function listClientLetters(clientId: string) {
  const client = await getClient(clientId);
  return client?.deskProfile?.clientLetters ?? [];
}

export async function createClientLetter(input: {
  clientId: string;
  templateKey: LetterTemplateKey;
  vars?: Partial<{
    director_name: string;
    tax_year: string;
    period_end: string;
    income_amount: string;
  }>;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const tpl = LETTER_TEMPLATES.find((t) => t.key === input.templateKey);
  if (!tpl) throw new Error("Unknown letter template");

  const letterhead = await getPracticeLetterhead();
  const today = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const body = mergeLetterBody(tpl.body, {
    client_name: client.name,
    company_name: client.name,
    company_number: client.companyNumber ?? "",
    director_name: input.vars?.director_name ?? "",
    tax_year: input.vars?.tax_year ?? "2025–26",
    period_end: input.vars?.period_end ?? "",
    income_amount: input.vars?.income_amount ?? "£—",
    practice_name: letterhead.practiceName || session.practiceName,
    sender_name: session.email?.split("@")[0] ?? "Accountant",
    today,
  });

  const now = new Date().toISOString();
  const letter: ClientLetterRecord = {
    id: crypto.randomUUID(),
    templateKey: input.templateKey,
    title: tpl.name,
    body,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    activity: [
      {
        id: crypto.randomUUID(),
        at: now,
        kind: "created",
        actorId: session.userId,
      },
    ],
  };

  const letters = [...(client.deskProfile?.clientLetters ?? []), letter];
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { clientLetters: letters }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "letters.created",
    entityType: "client_letter",
    entityId: letter.id,
    detail: { title: letter.title, templateKey: letter.templateKey },
  }).catch(() => undefined);
  revalidatePath(`/clients/${input.clientId}/forms`);
  return letter;
}

export async function saveClientLetter(input: {
  clientId: string;
  letterId: string;
  title: string;
  body: string;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const letters = [...(client.deskProfile?.clientLetters ?? [])];
  const idx = letters.findIndex((l) => l.id === input.letterId);
  if (idx < 0) throw new Error("Letter not found");
  const now = new Date().toISOString();
  letters[idx] = {
    ...letters[idx],
    title: input.title.trim() || letters[idx].title,
    body: input.body,
    updatedAt: now,
    activity: [
      ...(letters[idx].activity ?? []),
      {
        id: crypto.randomUUID(),
        at: now,
        kind: "amended" as const,
        actorId: session.userId,
      },
    ],
  };
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { clientLetters: letters }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "letters.amended",
    entityType: "client_letter",
    entityId: letters[idx].id,
  }).catch(() => undefined);
  revalidatePath(`/clients/${input.clientId}/forms`);
  return letters[idx];
}

export async function markClientLetterSent(input: {
  clientId: string;
  letterId: string;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const letters = [...(client.deskProfile?.clientLetters ?? [])];
  const idx = letters.findIndex((l) => l.id === input.letterId);
  if (idx < 0) throw new Error("Letter not found");
  const now = new Date().toISOString();
  letters[idx] = {
    ...letters[idx],
    status: "sent",
    sentAt: now,
    updatedAt: now,
    activity: [
      ...(letters[idx].activity ?? []),
      {
        id: crypto.randomUUID(),
        at: now,
        kind: "sent" as const,
        actorId: session.userId,
        note: "Marked sent to client / third party",
      },
    ],
  };
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { clientLetters: letters }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "letters.sent",
    entityType: "client_letter",
    entityId: letters[idx].id,
    detail: { title: letters[idx].title },
  }).catch(() => undefined);
  revalidatePath(`/clients/${input.clientId}/forms`);
  return letters[idx];
}

export async function deleteClientLetter(input: {
  clientId: string;
  letterId: string;
}) {
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const letters = (client.deskProfile?.clientLetters ?? []).filter(
    (l) => l.id !== input.letterId,
  );
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { clientLetters: letters }),
  );
  revalidatePath(`/clients/${input.clientId}/forms`);
  return { ok: true as const };
}
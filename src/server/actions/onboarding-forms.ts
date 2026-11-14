"use server";

import { rateLimitByIp } from "@/lib/rate-limit";
import { inspectUpload } from "@/lib/file-types";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import type { DeskProfile } from "@/lib/desk-profile";
import {
  defaultOnboardingFields,
  pushFormActivity,
  type OnboardingField,
  type OnboardingFormRecord,
  type OnboardingFormUpload,
} from "@/lib/onboarding-forms";
import { STANDARD_FORMS } from "@/lib/standard-forms";
import { requireSession } from "@/server/auth/session";
import { demoStore } from "@/server/demo/store";
import { getClient } from "@/server/actions/clients";
import { appendAuditEvent } from "@/server/audit/log";

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

function revalidateForms(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath(`/clients/${clientId}/forms`);
  revalidatePath(`/clients/${clientId}/documents`);
  revalidatePath(`/clients/${clientId}/portal`);
}

function buildSeedForms(actorId?: string): OnboardingFormRecord[] {
  const now = new Date().toISOString();
  return STANDARD_FORMS.map((tpl) => {
    const base: OnboardingFormRecord = {
      id: crypto.randomUUID(),
      name: tpl.name,
      description: tpl.description,
      fields: tpl.fields(),
      token: randomBytes(18).toString("hex"),
      status: "draft",
      templateKey: tpl.key,
      createdAt: now,
      updatedAt: now,
    };
    return pushFormActivity(base, "created", {
      actorId,
      note: `Seeded standard form “${tpl.name}”`,
    });
  });
}

/** Ensures every client has the standard form pack (drafts) to amend before send. */
export async function listClientOnboardingForms(clientId: string) {
  const client = await getClient(clientId);
  if (!client) return [];
  const existing = client.deskProfile?.onboardingForms ?? [];
  if (existing.length > 0) return existing;

  const session = await requireSession();
  const seeded = buildSeedForms(session.userId);
  await writeProfile(
    clientId,
    mergeProfile(client.deskProfile, { onboardingForms: seeded }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "forms.standards_seeded",
    entityType: "onboarding_form",
    entityId: clientId,
    detail: { count: seeded.length },
  }).catch(() => undefined);
  revalidateForms(clientId);
  return seeded;
}

export async function createOnboardingForm(input: {
  clientId: string;
  name?: string;
  useDefaultFields?: boolean;
  templateKey?: string;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const now = new Date().toISOString();
  const standard = input.templateKey
    ? STANDARD_FORMS.find((t) => t.key === input.templateKey)
    : null;
  let form: OnboardingFormRecord = {
    id: crypto.randomUUID(),
    name: input.name?.trim() || standard?.name || "Client onboarding",
    description:
      standard?.description ||
      "Please complete this form and upload the documents your accountant has asked for.",
    fields:
      standard?.fields() ??
      (input.useDefaultFields === false ? [] : defaultOnboardingFields()),
    token: randomBytes(18).toString("hex"),
    status: "draft",
    templateKey: standard?.key,
    createdAt: now,
    updatedAt: now,
  };
  form = pushFormActivity(form, "created", { actorId: session.userId });
  const forms = [...(client.deskProfile?.onboardingForms ?? []), form];
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { onboardingForms: forms }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "forms.created",
    entityType: "onboarding_form",
    entityId: form.id,
    detail: { name: form.name, templateKey: form.templateKey },
  }).catch(() => undefined);
  revalidateForms(input.clientId);
  return form;
}

export async function saveOnboardingForm(input: {
  clientId: string;
  formId: string;
  name: string;
  description: string;
  fields: OnboardingField[];
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const forms = [...(client.deskProfile?.onboardingForms ?? [])];
  const idx = forms.findIndex((f) => f.id === input.formId);
  if (idx < 0) throw new Error("Form not found");
  if (forms[idx].status === "submitted") {
    throw new Error("This form was already submitted — create a new one to edit.");
  }
  forms[idx] = pushFormActivity(
    {
      ...forms[idx],
      name: input.name.trim() || forms[idx].name,
      description: input.description,
      fields: input.fields,
    },
    "amended",
    { actorId: session.userId },
  );
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { onboardingForms: forms }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "forms.amended",
    entityType: "onboarding_form",
    entityId: forms[idx].id,
    detail: { name: forms[idx].name },
  }).catch(() => undefined);
  revalidateForms(input.clientId);
  return forms[idx];
}

export async function publishOnboardingForm(input: {
  clientId: string;
  formId: string;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const forms = [...(client.deskProfile?.onboardingForms ?? [])];
  const idx = forms.findIndex((f) => f.id === input.formId);
  if (idx < 0) throw new Error("Form not found");
  if (!forms[idx].fields.length) {
    throw new Error("Add at least one field before sending the link.");
  }
  if (forms[idx].status === "submitted") {
    return forms[idx];
  }
  forms[idx] = pushFormActivity(forms[idx], "sent", {
    actorId: session.userId,
    note: "Client link published",
  });
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { onboardingForms: forms }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "forms.link_sent",
    entityType: "onboarding_form",
    entityId: forms[idx].id,
    detail: { name: forms[idx].name, token: forms[idx].token },
  }).catch(() => undefined);
  revalidateForms(input.clientId);
  return forms[idx];
}

/** Public: record that the client opened the form link. */
export async function recordFormOpened(token: string) {
  if (!(await rateLimitByIp("form-open", { limit: 60, windowMs: 10 * 60_000, extraKey: String(token).slice(0, 64) })).ok) {
    return { ok: false as const };
  }
  const found = await findFormByShareToken(token);
  if (!found) return { ok: false as const };
  if (found.form.status === "draft" || found.form.status === "submitted") {
    return { ok: true as const, already: true as const };
  }
  if (found.form.openedAt) return { ok: true as const, already: true as const };

  let profile: DeskProfile = {};
  if (isDemoMode()) {
    profile = {
      ...(demoStore.clients.find((c) => c.id === found.clientId)?.deskProfile ??
        {}),
    };
  } else if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { data } = await getSupabaseAdmin()
      .from("clients")
      .select("desk_profile")
      .eq("id", found.clientId)
      .maybeSingle();
    profile = { ...((data?.desk_profile as DeskProfile) ?? {}) };
  } else {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (hasDatabase()) {
      const { clients } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await getDb()
        .select()
        .from(clients)
        .where(eq(clients.id, found.clientId))
        .limit(1);
      profile = { ...((rows[0]?.deskProfile as DeskProfile) ?? {}) };
    }
  }

  const forms = [...(profile.onboardingForms ?? [])];
  const idx = forms.findIndex((f) => f.id === found.form.id);
  if (idx < 0) return { ok: false as const };
  forms[idx] = pushFormActivity(forms[idx], "opened", {
    note: "Client opened the form link",
  });
  await persistFormUpdate(found.clientId, found.practiceId, {
    ...profile,
    onboardingForms: forms,
  });
  await appendAuditEvent({
    practiceId: found.practiceId,
    clientId: found.clientId,
    actorId: "client-form",
    action: "forms.opened",
    entityType: "onboarding_form",
    entityId: forms[idx].id,
    detail: { name: forms[idx].name },
  }).catch(() => undefined);
  revalidateForms(found.clientId);
  return { ok: true as const, already: false as const };
}

export async function deleteOnboardingForm(input: {
  clientId: string;
  formId: string;
}) {
  const client = await getClient(input.clientId);
  if (!client) throw new Error("Client not found");
  const forms = (client.deskProfile?.onboardingForms ?? []).filter(
    (f) => f.id !== input.formId,
  );
  await writeProfile(
    input.clientId,
    mergeProfile(client.deskProfile, { onboardingForms: forms }),
  );
  revalidateForms(input.clientId);
  return { ok: true as const };
}

export async function findFormByShareToken(token: string) {
  if (!token || token.length < 16) return null;

  if (isDemoMode()) {
    for (const row of demoStore.clients) {
      const form = row.deskProfile?.onboardingForms?.find((f) => f.token === token);
      if (form) {
        return {
          clientId: row.id,
          practiceId: row.practiceId,
          clientName: row.name,
          form,
        };
      }
    }
    return null;
  }

  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    // Nested form tokens live in desk_profile JSON; scan recent/active clients.
    const { data, error } = await supabase
      .from("clients")
      .select("id,practice_id,name,desk_profile")
      .not("desk_profile", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error || !data) return null;
    for (const row of data) {
      const profile = (row.desk_profile as DeskProfile) ?? {};
      const form = profile.onboardingForms?.find((f) => f.token === token);
      if (form) {
        return {
          clientId: row.id as string,
          practiceId: row.practice_id as string,
          clientName: row.name as string,
          form,
        };
      }
    }
    return null;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return null;
  const { clients } = await import("@/server/db/schema");
  const rows = await getDb().select().from(clients).limit(500);
  for (const row of rows) {
    const profile = (row.deskProfile as DeskProfile) ?? {};
    const form = profile.onboardingForms?.find((f) => f.token === token);
    if (form) {
      return {
        clientId: row.id,
        practiceId: row.practiceId,
        clientName: row.name,
        form,
      };
    }
  }
  return null;
}

async function persistFormUpdate(
  clientId: string,
  practiceId: string,
  profile: DeskProfile,
) {
  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (row) {
      row.deskProfile = profile;
      row.updatedAt = new Date().toISOString();
    }
    return;
  }
  if (isSupabaseConfigured()) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const { error } = await getSupabaseAdmin()
      .from("clients")
      .update({
        desk_profile: profile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("practice_id", practiceId);
    if (error) throw new Error(error.message);
    return;
  }
  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) throw new Error("Storage is not configured");
  const { clients } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDb()
    .update(clients)
    .set({ deskProfile: profile, updatedAt: new Date() })
    .where(eq(clients.id, clientId));
}

const FORM_FILE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

async function storePublicUpload(input: {
  practiceId: string;
  clientId: string;
  file: File;
  category: string;
  uploadedBy: string;
}): Promise<{ documentId: string; blobUrl: string; filename: string }> {
  const { storeClientDocumentBytes } = await import(
    "@/server/documents/store-bytes"
  );
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  // Allow-list + magic-byte check (declared MIME is attacker-controlled).
  const inspected = inspectUpload({
    filename: input.file.name,
    declaredType: input.file.type,
    bytes,
  });
  if (!inspected.allowed) {
    throw new Error("Unsupported or mismatched file type.");
  }
  const stored = await storeClientDocumentBytes({
    practiceId: input.practiceId,
    clientId: input.clientId,
    filename: input.file.name,
    contentType: inspected.contentType,
    bytes,
    category: input.category,
    uploadedBy: input.uploadedBy,
    folder: "forms",
    asPdfIfImage: true,
  });
  return {
    documentId: stored.documentId,
    blobUrl: stored.blobUrl,
    filename: stored.filename,
  };
}

export async function submitOnboardingForm(formData: FormData) {
  try {
    const token = String(formData.get("token") ?? "");
    // Public (token-only) endpoint: throttle per client IP + token.
    const throttle = await rateLimitByIp("form-submit", {
      limit: 15,
      windowMs: 10 * 60_000,
      extraKey: token.slice(0, 64),
    });
    if (!throttle.ok) {
      return { ok: false as const, error: "Too many submissions. Please wait a few minutes and try again." };
    }
    const found = await findFormByShareToken(token);
    if (!found) return { ok: false as const, error: "Form link not found." };
    if (found.form.status === "submitted") {
      return { ok: false as const, error: "This form was already submitted." };
    }

    const answers: Record<string, string | boolean> = {};
    const uploads: OnboardingFormUpload[] = [...(found.form.uploads ?? [])];

    for (const field of found.form.fields) {
      if (field.type === "section") continue;
      if (field.type === "file") {
        const file = formData.get(`file_${field.id}`);
        if (file instanceof File && file.size > 0) {
          if (file.size > 15 * 1024 * 1024) {
            return { ok: false as const, error: `${field.label}: file exceeds 15 MB.` };
          }
          if (file.type && !FORM_FILE_TYPES.has(file.type)) {
            return {
              ok: false as const,
              error: `${field.label}: use PDF, image, CSV, or Excel.`,
            };
          }
          const stored = await storePublicUpload({
            practiceId: found.practiceId,
            clientId: found.clientId,
            file,
            category: field.documentCategory ?? "general",
            uploadedBy: "client-form",
          });
          uploads.push({
            fieldId: field.id,
            filename: stored.filename,
            documentId: stored.documentId,
            uploadedAt: new Date().toISOString(),
          });
          answers[field.id] = stored.filename;
        } else if (field.required) {
          return { ok: false as const, error: `${field.label} is required.` };
        }
        continue;
      }
      if (field.type === "checkbox") {
        const checked = formData.get(`field_${field.id}`) === "on";
        if (field.required && !checked) {
          return { ok: false as const, error: `Please tick: ${field.label}` };
        }
        answers[field.id] = checked;
        continue;
      }
      const value = String(formData.get(`field_${field.id}`) ?? "").trim();
      if (field.required && !value) {
        return { ok: false as const, error: `${field.label} is required.` };
      }
      answers[field.id] = value;
    }

    // Load fresh profile for concurrent-safe write
    let profile: DeskProfile = {};
    if (isDemoMode()) {
      profile = {
        ...(demoStore.clients.find((c) => c.id === found.clientId)?.deskProfile ??
          {}),
      };
    } else if (isSupabaseConfigured()) {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      const { data } = await getSupabaseAdmin()
        .from("clients")
        .select("desk_profile")
        .eq("id", found.clientId)
        .maybeSingle();
      profile = { ...((data?.desk_profile as DeskProfile) ?? {}) };
    } else {
      const { getDb, hasDatabase } = await import("@/server/db");
      if (hasDatabase()) {
        const { clients } = await import("@/server/db/schema");
        const { eq } = await import("drizzle-orm");
        const rows = await getDb()
          .select()
          .from(clients)
          .where(eq(clients.id, found.clientId))
          .limit(1);
        profile = { ...((rows[0]?.deskProfile as DeskProfile) ?? {}) };
      }
    }

    const forms = [...(profile.onboardingForms ?? [])];
    const idx = forms.findIndex((f) => f.id === found.form.id);
    if (idx < 0) return { ok: false as const, error: "Form not found." };
    forms[idx] = pushFormActivity(
      {
        ...forms[idx],
        answers,
        uploads,
      },
      "submitted",
      { note: `${uploads.length} file(s) attached` },
    );
    await persistFormUpdate(found.clientId, found.practiceId, {
      ...profile,
      onboardingForms: forms,
    });
    await appendAuditEvent({
      practiceId: found.practiceId,
      clientId: found.clientId,
      actorId: "client-form",
      action: "forms.submitted",
      entityType: "onboarding_form",
      entityId: forms[idx].id,
      detail: {
        name: forms[idx].name,
        uploadCount: uploads.length,
        answerKeys: Object.keys(answers),
      },
    }).catch(() => undefined);
    revalidateForms(found.clientId);
    return { ok: true as const };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : "Could not submit the form.",
    };
  }
}

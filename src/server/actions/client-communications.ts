"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { listClients, getClient } from "@/server/actions/clients";
import { clientSlugFor } from "@/lib/client-slug";
import {
  accountsDueMonthWindow,
  monthWindowLabel,
  type AccountsDueMonthWindow,
} from "@/lib/filing-due";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  applyClientEmailTemplate,
  buildTemplateVars,
  defaultAccountsReminderTemplate,
  messagePreview,
  resolveClientEmailSender,
} from "@/lib/client-email";
import { sendTransactionalEmail } from "@/server/email/transactional";
import { appendAuditEvent } from "@/server/audit/log";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";

export type ClientEmailLogRecord = {
  id: string;
  clientId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  messagePreview: string | null;
  kind: string;
  documentCount: number;
  delivery: string;
  accountsDue: string | null;
  createdAt: string;
};

export type BulkEmailCandidate = {
  clientId: string;
  slug: string;
  name: string;
  companyNumber: string | null;
  contactEmail: string | null;
  accountsDue: string | null;
  dueWindow: AccountsDueMonthWindow;
};

async function insertClientEmailLog(input: {
  practiceId: string;
  clientId: string;
  sentBy: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  messagePreview: string;
  kind: string;
  documentCount?: number;
  delivery: string;
  accountsDue?: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();
  const row = {
    id,
    practiceId: input.practiceId,
    clientId: input.clientId,
    sentBy: input.sentBy,
    fromEmail: input.fromEmail,
    toEmail: input.toEmail,
    subject: input.subject,
    messagePreview: input.messagePreview,
    kind: input.kind,
    documentCount: input.documentCount ?? 0,
    delivery: input.delivery,
    accountsDue: input.accountsDue ?? null,
    createdAt: new Date().toISOString(),
  };

  if (isMemoryStore() || isDemoMode()) {
    demoStore.emailLogs.push(row);
    return id;
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase.from("client_email_logs").insert({
      id: row.id,
      practice_id: input.practiceId,
      client_id: input.clientId,
      sent_by: input.sentBy,
      from_email: input.fromEmail,
      to_email: input.toEmail,
      subject: input.subject,
      message_preview: input.messagePreview,
      kind: input.kind,
      document_count: input.documentCount ?? 0,
      delivery: input.delivery,
      accounts_due: input.accountsDue ?? null,
    });
    if (error) throw new Error(error.message);
    return id;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return id;
  const { clientEmailLogs } = await import("@/server/db/schema");
  await getDb().insert(clientEmailLogs).values({
    practiceId: input.practiceId,
    clientId: input.clientId,
    sentBy: input.sentBy,
    fromEmail: input.fromEmail,
    toEmail: input.toEmail,
    subject: input.subject,
    messagePreview: input.messagePreview,
    kind: input.kind,
    documentCount: input.documentCount ?? 0,
    delivery: input.delivery,
    accountsDue: input.accountsDue ?? null,
  });
  return id;
}

export async function listClientEmailLogs(
  clientId: string,
): Promise<ClientEmailLogRecord[]> {
  const session = await requireSession();
  await getClient(clientId);

  if (isMemoryStore() || isDemoMode()) {
    return demoStore.emailLogs
      .filter(
        (l) => l.clientId === clientId && l.practiceId === session.practiceId,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((l) => ({
        id: l.id,
        clientId: l.clientId,
        fromEmail: l.fromEmail,
        toEmail: l.toEmail,
        subject: l.subject,
        messagePreview: l.messagePreview,
        kind: l.kind,
        documentCount: l.documentCount,
        delivery: l.delivery,
        accountsDue: l.accountsDue,
        createdAt: l.createdAt,
      }));
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_email_logs")
      .select("*")
      .eq("client_id", clientId)
      .eq("practice_id", session.practiceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      clientId: row.client_id as string,
      fromEmail: row.from_email as string,
      toEmail: row.to_email as string,
      subject: row.subject as string,
      messagePreview: (row.message_preview as string | null) ?? null,
      kind: row.kind as string,
      documentCount: Number(row.document_count ?? 0),
      delivery: row.delivery as string,
      accountsDue: (row.accounts_due as string | null) ?? null,
      createdAt: row.created_at as string,
    }));
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return [];
  const { clientEmailLogs } = await import("@/server/db/schema");
  const { eq, and, desc } = await import("drizzle-orm");
  const rows = await getDb()
    .select()
    .from(clientEmailLogs)
    .where(
      and(
        eq(clientEmailLogs.clientId, clientId),
        eq(clientEmailLogs.practiceId, session.practiceId),
      ),
    )
    .orderBy(desc(clientEmailLogs.createdAt));
  return rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    fromEmail: row.fromEmail,
    toEmail: row.toEmail,
    subject: row.subject,
    messagePreview: row.messagePreview,
    kind: row.kind,
    documentCount: row.documentCount,
    delivery: row.delivery,
    accountsDue: row.accountsDue,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listBulkEmailCandidates(): Promise<{
  candidates: BulkEmailCandidate[];
  nextMonthLabel: string;
  monthAfterLabel: string;
}> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const now = new Date();
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));

  const candidates: BulkEmailCandidate[] = [];
  for (const client of clients) {
    if (client.type !== "limited_company") continue;

    const ch =
      ("companiesHouse" in client
        ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
        : null) ?? null;
    const accountsDue = ch?.accountsNextDue ?? null;
    const dueWindow = accountsDueMonthWindow(accountsDue, now);
    if (!dueWindow) continue;

    candidates.push({
      clientId: client.id,
      slug: clientSlugFor({ id: client.id, name: client.name }, peers),
      name: client.name,
      companyNumber: client.companyNumber ?? null,
      contactEmail: client.contactEmail ?? null,
      accountsDue,
      dueWindow,
    });
  }

  candidates.sort((a, b) => {
    const ad = a.accountsDue ?? "";
    const bd = b.accountsDue ?? "";
    return ad.localeCompare(bd);
  });

  return {
    candidates,
    nextMonthLabel: monthWindowLabel("next_month", now),
    monthAfterLabel: monthWindowLabel("month_after", now),
  };
}

const sendOneSchema = z.object({
  clientId: z.string().min(1),
  toEmail: z.string().email(),
  subject: z.string().min(3).max(200),
  message: z.string().min(1).max(8000),
  kind: z.string().default("general"),
  accountsDue: z.string().optional().nullable(),
  documentCount: z.number().int().min(0).default(0),
});

export async function sendClientCommunicationEmail(
  input: z.infer<typeof sendOneSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = sendOneSchema.parse(input);
  const client = await getClient(data.clientId);
  const sender = resolveClientEmailSender(session);

  const delivery = await sendTransactionalEmail({
    to: data.toEmail,
    from: sender.from,
    replyTo: sender.replyTo,
    subject: data.subject,
    text: data.message,
  });

  const logId = await insertClientEmailLog({
    practiceId: session.practiceId,
    clientId: data.clientId,
    sentBy: session.userId,
    fromEmail: sender.senderEmail,
    toEmail: data.toEmail,
    subject: data.subject,
    messagePreview: messagePreview(data.message),
    kind: data.kind,
    documentCount: data.documentCount,
    delivery,
    accountsDue: data.accountsDue ?? null,
  });

  if (isMemoryStore() || isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === data.clientId);
    if (row) row.contactEmail = data.toEmail;
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase
      .from("clients")
      .update({ contact_email: data.toEmail })
      .eq("id", data.clientId)
      .eq("practice_id", session.practiceId);
  } else {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (hasDatabase()) {
      const { clients } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      await getDb()
        .update(clients)
        .set({ contactEmail: data.toEmail })
        .where(eq(clients.id, data.clientId));
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "client.email.send",
    entityType: "email",
    entityId: logId,
    detail: {
      kind: data.kind,
      delivery,
      toDomain: data.toEmail.split("@")[1] ?? "unknown",
    },
  });

  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/communications`);

  return { ok: true as const, delivery, logId };
}

const bulkSchema = z.object({
  clientIds: z.array(z.string()).min(1).max(500),
  subject: z.string().min(3).max(200),
  messageTemplate: z.string().min(1).max(8000),
});

export async function sendBulkClientEmails(input: z.infer<typeof bulkSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = bulkSchema.parse(input);
  const { candidates } = await listBulkEmailCandidates();
  const eligible = new Map(candidates.map((c) => [c.clientId, c]));

  const sender = resolveClientEmailSender(session);
  const results: Array<{
    clientId: string;
    name: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const clientId of data.clientIds) {
    const row = eligible.get(clientId);
    if (!row) {
      results.push({
        clientId,
        name: clientId,
        ok: false,
        error: "Not eligible (accounts not due next month or month after)",
      });
      continue;
    }
    if (!row.contactEmail) {
      results.push({
        clientId,
        name: row.name,
        ok: false,
        error: "No contact email on file",
      });
      continue;
    }

    const vars = buildTemplateVars({
      clientName: row.name,
      accountsDueIso: row.accountsDue,
      companyNumber: row.companyNumber,
      practiceName: session.practiceName,
      senderName: sender.senderName,
    });
    const subject = applyClientEmailTemplate(data.subject, vars);
    const message = applyClientEmailTemplate(data.messageTemplate, vars);

    try {
      await sendClientCommunicationEmail({
        clientId,
        toEmail: row.contactEmail,
        subject,
        message,
        kind: "bulk_accounts_reminder",
        accountsDue: row.accountsDue,
        documentCount: 0,
      });
      results.push({ clientId, name: row.name, ok: true });
    } catch (err) {
      results.push({
        clientId,
        name: row.name,
        ok: false,
        error: err instanceof Error ? err.message : "Send failed",
      });
    }
  }

  revalidatePath("/clients/bulk-email");
  revalidatePath("/clients");

  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    senderEmail: sender.senderEmail,
  };
}

export async function getDefaultBulkEmailDraft() {
  const session = await requireSession();
  const sender = resolveClientEmailSender(session);
  return {
    subject: "Annual accounts due — {{client_name}}",
    messageTemplate: defaultAccountsReminderTemplate(),
    senderEmail: sender.senderEmail,
    senderName: sender.senderName,
    practiceName: session.practiceName,
  };
}

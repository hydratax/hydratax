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
  defaultSaReminderTemplate,
  defaultVatReminderTemplate,
  messagePreview,
  resolveClientEmailSender,
} from "@/lib/client-email";
import { sendTransactionalEmail } from "@/server/email/transactional";
import { appendAuditEvent } from "@/server/audit/log";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { filingSaTaxYear } from "@/lib/sa-tax-year";
import { personKeySlug } from "@/lib/sa-taxpayer";
import { listPracticeDirectors } from "@/server/actions/sa-directors";
import { listSa100Returns } from "@/server/actions/sa100";

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

export type BulkSaEmailCandidate = {
  /** Stable selection key (client id or person key) */
  id: string;
  clientId: string;
  slug: string;
  name: string;
  contactEmail: string | null;
  taxYear: string;
  filingDue: string;
  status: "none" | "draft" | "submitted" | "accepted";
  href: string;
};

export async function insertClientEmailLog(input: {
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

export async function listBulkSaEmailCandidates(): Promise<{
  candidates: BulkSaEmailCandidate[];
  taxYear: string;
  filingDue: string;
}> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const filingYear = filingSaTaxYear();
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const directors = await listPracticeDirectors().catch(() => []);
  const seen = new Set<string>();
  const candidates: BulkSaEmailCandidate[] = [];

  for (const client of clients) {
    if (client.type !== "sole_trader" && client.type !== "partnership") {
      continue;
    }
    const slug = clientSlugFor({ id: client.id, name: client.name }, peers);
    const returns = await listSa100Returns(client.id).catch(() => []);
    const match =
      returns.find((r) => r.taxYear === filingYear.label) ?? null;
    const status = match
      ? match.status === "accepted"
        ? ("accepted" as const)
        : match.status === "submitted"
          ? ("submitted" as const)
          : ("draft" as const)
      : ("none" as const);

    seen.add(client.id);
    candidates.push({
      id: client.id,
      clientId: client.id,
      slug,
      name: client.name,
      contactEmail: client.contactEmail ?? null,
      taxYear: filingYear.label,
      filingDue: filingYear.filingDue,
      status,
      href: `/clients/${slug}/self-assessment`,
    });
  }

  for (const d of directors) {
    if (seen.has(d.homeClientId) || seen.has(d.key)) continue;
    const email =
      d.taxpayer?.email?.trim() ||
      clients.find((c) => c.id === d.homeClientId)?.contactEmail ||
      null;
    seen.add(d.key);
    candidates.push({
      id: d.key,
      clientId: d.homeClientId,
      slug: d.homeSlug,
      name: d.fullName,
      contactEmail: email,
      taxYear: d.filing.taxYear || filingYear.label,
      filingDue: d.filing.filingDue || filingYear.filingDue,
      status: d.filing.status || "none",
      href: `/self-assessment/${personKeySlug(d.key)}`,
    });
  }

  candidates.sort((a, b) => {
    const due = a.filingDue.localeCompare(b.filingDue);
    if (due !== 0) return due;
    return a.name.localeCompare(b.name);
  });

  return {
    candidates,
    taxYear: filingYear.label,
    filingDue: filingYear.filingDue,
  };
}

const sendOneSchema = z.object({
  clientId: z.string().min(1),
  toEmail: z.string().email(),
  subject: z.string().min(3).max(200),
  message: z.string().min(1).max(8000),
  html: z.string().max(500_000).optional(),
  kind: z.string().default("general"),
  accountsDue: z.string().optional().nullable(),
  documentCount: z.number().int().min(0).default(0),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        content: z.string().min(1),
        contentType: z.string().optional(),
      }),
    )
    .optional(),
});

export async function sendClientCommunicationEmail(
  input: z.infer<typeof sendOneSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = sendOneSchema.parse(input);
  const client = await getClient(data.clientId);
  let practiceEmail: string | null = null;
  try {
    const { getPracticeLetterhead } = await import(
      "@/server/actions/letterhead"
    );
    const lh = await getPracticeLetterhead();
    practiceEmail = lh.email?.trim() || null;
  } catch {
    /* letterhead optional */
  }
  const sender = resolveClientEmailSender(session, { practiceEmail });

  const delivery = await sendTransactionalEmail({
    to: data.toEmail,
    from: sender.from,
    replyTo: sender.replyTo,
    subject: data.subject,
    text: data.message,
    html: data.html,
    attachments: data.attachments,
  });

  const logId = await insertClientEmailLog({
    practiceId: session.practiceId,
    clientId: data.clientId,
    sentBy: session.userId,
    fromEmail: sender.from,
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

  try {
    const { appendClientWorkLog } = await import("@/server/actions/desk");
    await appendClientWorkLog({
      clientId: data.clientId,
      kind: "email",
      label: `Email sent — ${data.subject}`,
      detail: `To ${data.toEmail}`,
    });
  } catch {
    /* work log is best-effort */
  }

  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/communications`);

  return { ok: true as const, delivery, logId };
}

/** Email send counts keyed by client id (for desk cards). */
export async function countEmailsByClientIds(
  clientIds: string[],
): Promise<Record<string, number>> {
  await requireSession();
  const unique = [...new Set(clientIds.filter(Boolean))];
  const counts: Record<string, number> = {};
  for (const id of unique) counts[id] = 0;
  if (!unique.length) return counts;

  if (isMemoryStore() || isDemoMode()) {
    for (const log of demoStore.emailLogs) {
      if (counts[log.clientId] !== undefined) {
        counts[log.clientId] += 1;
      }
    }
    return counts;
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("client_email_logs")
      .select("client_id")
      .in("client_id", unique);
    for (const row of data ?? []) {
      const id = row.client_id as string;
      if (counts[id] !== undefined) counts[id] += 1;
    }
    return counts;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return counts;
  const { clientEmailLogs } = await import("@/server/db/schema");
  const { inArray } = await import("drizzle-orm");
  const rows = await getDb()
    .select({ clientId: clientEmailLogs.clientId })
    .from(clientEmailLogs)
    .where(inArray(clientEmailLogs.clientId, unique));
  for (const row of rows) {
    if (counts[row.clientId] !== undefined) counts[row.clientId] += 1;
  }
  return counts;
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

export async function getDefaultSaBulkEmailDraft() {
  const session = await requireSession();
  const sender = resolveClientEmailSender(session);
  const filingYear = filingSaTaxYear();
  return {
    subject: `Self Assessment ${filingYear.label} — {{client_name}}`,
    messageTemplate: defaultSaReminderTemplate(),
    senderEmail: sender.senderEmail,
    senderName: sender.senderName,
    practiceName: session.practiceName,
    taxYear: filingYear.label,
    filingDue: filingYear.filingDue,
  };
}

const saBulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  subject: z.string().min(3).max(200),
  messageTemplate: z.string().min(1).max(8000),
});

export async function sendBulkSaEmails(input: z.infer<typeof saBulkSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = saBulkSchema.parse(input);
  const { candidates } = await listBulkSaEmailCandidates();
  const eligible = new Map(candidates.map((c) => [c.id, c]));
  const sender = resolveClientEmailSender(session);

  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const id of data.ids) {
    const row = eligible.get(id);
    if (!row) {
      results.push({
        id,
        name: id,
        ok: false,
        error: "Not on the Self Assessment list",
      });
      continue;
    }
    if (!row.contactEmail) {
      results.push({
        id,
        name: row.name,
        ok: false,
        error: "No email on file",
      });
      continue;
    }

    const vars = buildTemplateVars({
      clientName: row.name,
      taxYear: row.taxYear,
      filingDueIso: row.filingDue,
      practiceName: session.practiceName,
      senderName: sender.senderName,
    });
    const subject = applyClientEmailTemplate(data.subject, vars);
    const message = applyClientEmailTemplate(data.messageTemplate, vars);

    try {
      await sendClientCommunicationEmail({
        clientId: row.clientId,
        toEmail: row.contactEmail,
        subject,
        message,
        kind: "bulk_sa_reminder",
        accountsDue: row.filingDue,
        documentCount: 0,
      });
      results.push({ id, name: row.name, ok: true });
    } catch (err) {
      results.push({
        id,
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

export type BulkVatEmailCandidate = {
  clientId: string;
  slug: string;
  name: string;
  vrn: string | null;
  contactEmail: string | null;
};

export type VatReminderMonth = {
  /** YYYY-MM */
  key: string;
  label: string;
  /** ISO date used as period-end placeholder in templates */
  periodEnd: string;
};

function vatReminderMonths(now = new Date()): VatReminderMonth[] {
  const months: VatReminderMonth[] = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const periodEnd = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
    months.push({ key, label, periodEnd });
  }
  return months;
}

function isVatRegisteredClient(c: {
  isVatRegistered: boolean;
  vrn: string | null;
}) {
  return c.isVatRegistered || Boolean(c.vrn?.trim());
}

export async function listBulkVatEmailCandidates(): Promise<{
  candidates: BulkVatEmailCandidate[];
  months: VatReminderMonth[];
}> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const candidates: BulkVatEmailCandidate[] = clients
    .filter(isVatRegisteredClient)
    .map((c) => ({
      clientId: c.id,
      slug: clientSlugFor({ id: c.id, name: c.name }, peers),
      name: c.name,
      vrn: c.vrn ?? null,
      contactEmail: c.contactEmail ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

  return { candidates, months: vatReminderMonths() };
}

export async function getDefaultVatBulkEmailDraft(monthKey?: string) {
  const session = await requireSession();
  const sender = resolveClientEmailSender(session);
  const months = vatReminderMonths();
  const month = months.find((m) => m.key === monthKey) ?? months[0]!;
  return {
    subject: `VAT return — {{client_name}} · ${month.label}`,
    messageTemplate: defaultVatReminderTemplate(),
    senderEmail: sender.senderEmail,
    senderName: sender.senderName,
    practiceName: session.practiceName,
    monthKey: month.key,
    monthLabel: month.label,
    periodEnd: month.periodEnd,
  };
}

const vatBulkSchema = z.object({
  clientIds: z.array(z.string()).min(1).max(500),
  subject: z.string().min(3).max(200),
  messageTemplate: z.string().min(1).max(8000),
  periodEnd: z.string().min(8).max(12),
});

export async function sendBulkVatEmails(input: z.infer<typeof vatBulkSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = vatBulkSchema.parse(input);
  const { candidates } = await listBulkVatEmailCandidates();
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
        error: "Not on the VAT client list",
      });
      continue;
    }
    if (!row.contactEmail) {
      results.push({
        clientId,
        name: row.name,
        ok: false,
        error: "No email on file",
      });
      continue;
    }

    const vars = buildTemplateVars({
      clientName: row.name,
      accountsDueIso: data.periodEnd,
      companyNumber: null,
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
        kind: "bulk_vat_reminder",
        accountsDue: data.periodEnd,
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


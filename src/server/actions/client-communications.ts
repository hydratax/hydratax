"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { listClients, getClient } from "@/server/actions/clients";
import { clientSlugFor } from "@/lib/client-slug";
import {
  calendarYearReminderMonths,
  currentMonthKey,
  monthKeyFromIso,
  type CalendarReminderMonth,
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
import { sendPracticeClientEmail } from "@/server/email/send-practice-outbound";
import { appendAuditEvent } from "@/server/audit/log";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { filingSaTaxYear } from "@/lib/sa-tax-year";
import { personKeySlug } from "@/lib/sa-taxpayer";
import { listPracticeDirectors } from "@/server/actions/sa-directors";
import { listSa100Returns } from "@/server/actions/sa100";
import { listRelevantCorporationTaxPeriods } from "@/lib/accounting-periods";
import {
  deriveCtClientSummary,
  type CtWorkflowStatus,
} from "@/lib/ct-client-status";
import {
  deriveVatClientSummary,
  type VatWorkflowStatus,
} from "@/lib/vat-client-status";
import { normalizeWorkStage } from "@/lib/client-work-stage";

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
  /** CT600 filing due (12 months after AP end), not Companies House accounts due. */
  accountsDue: string | null;
  /** YYYY-MM of accountsDue */
  dueMonthKey: string;
  workStage?: string | null;
  ctStatus: CtWorkflowStatus;
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
  /** Desk pipeline stage for SA bulk-email filters. */
  workStage?: string | null;
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
    // Email may already have been sent — never fail the user on a log write.
    if (error) {
      console.error("[email] client_email_logs insert failed", error.message);
    }
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
  months: CalendarReminderMonth[];
  years: number[];
  defaultMonthKey: string;
  defaultYear: number;
}> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const now = new Date();
  const year = now.getFullYear();
  const years = [year, year + 1];
  const months = calendarYearReminderMonths(now);
  const yearKeys = new Set(
    years.flatMap((y) =>
      calendarYearReminderMonths(new Date(y, 0, 1)).map((m) => m.key),
    ),
  );
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));

  const candidates: BulkEmailCandidate[] = [];
  for (const client of clients) {
    if (client.type !== "limited_company") continue;

    const ch =
      ("companiesHouse" in client
        ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
        : null) ?? null;
    const workStage = normalizeWorkStage(client.deskProfile?.workStage);
    const periods = listRelevantCorporationTaxPeriods({
      incorporatedOn: ch?.incorporatedOn ?? null,
      accountsPeriodEnd: ch?.accountsPeriodEnd ?? null,
      lastAccountsMadeUpTo: ch?.lastAccountsMadeUpTo ?? null,
      now,
    });
    const inWindow = periods
      .map((p) => ({
        due: p.filingDue,
        key: monthKeyFromIso(p.filingDue),
      }))
      .filter((p) => p.key && yearKeys.has(p.key))
      .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
    const pick = inWindow[0] ?? null;
    if (!pick?.key || !pick.due) continue;

    const ct = deriveCtClientSummary({
      workStage,
      companiesHouse: ch,
      now,
    });

    candidates.push({
      clientId: client.id,
      slug: clientSlugFor({ id: client.id, name: client.name }, peers),
      name: client.name,
      companyNumber: client.companyNumber ?? null,
      contactEmail: client.contactEmail ?? null,
      accountsDue: pick.due,
      dueMonthKey: pick.key,
      workStage,
      ctStatus: ct.status,
    });
  }

  candidates.sort((a, b) => {
    const ad = a.accountsDue ?? "";
    const bd = b.accountsDue ?? "";
    return ad.localeCompare(bd);
  });

  return {
    candidates,
    months,
    years,
    defaultMonthKey: currentMonthKey(now),
    defaultYear: year,
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
      workStage: client.deskProfile?.workStage ?? null,
      href: `/clients/${slug}/self-assessment`,
    });
  }

  for (const d of directors) {
    if (seen.has(d.homeClientId) || seen.has(d.key)) continue;
    const home = clients.find((c) => c.id === d.homeClientId);
    const email =
      d.taxpayer?.email?.trim() || home?.contactEmail || null;
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
      workStage: home?.deskProfile?.workStage ?? null,
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
  let practiceName: string | null = null;
  try {
    const { getPracticeLetterhead } = await import(
      "@/server/actions/letterhead"
    );
    const lh = await getPracticeLetterhead();
    practiceEmail = lh.email?.trim() || null;
    practiceName = lh.practiceName?.trim() || null;
  } catch {
    /* letterhead optional */
  }

  const outbound = await sendPracticeClientEmail({
    session,
    practiceEmail,
    practiceName,
    mail: {
      to: data.toEmail,
      subject: data.subject,
      text: data.message,
      html: data.html,
      attachments: data.attachments,
    },
  });

  const logId = await insertClientEmailLog({
    practiceId: session.practiceId,
    clientId: data.clientId,
    sentBy: session.userId,
    fromEmail: outbound.from,
    toEmail: data.toEmail,
    subject: data.subject,
    messagePreview: messagePreview(data.message),
    kind: data.kind,
    documentCount: data.documentCount,
    delivery: outbound.delivery,
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
      delivery: outbound.delivery,
      toDomain: data.toEmail.split("@")[1] ?? "unknown",
    },
  });

  try {
    const { appendClientWorkLog, setClientWorkStage } = await import(
      "@/server/actions/desk"
    );
    const { deskFromEmailKind, normalizeWorkStage } = await import(
      "@/lib/client-work-stage"
    );
    const desk = deskFromEmailKind(data.kind);
    await appendClientWorkLog({
      clientId: data.clientId,
      kind: "email",
      label: `Email sent — ${data.subject}`,
      detail: `To ${data.toEmail} · via ${outbound.delivery}`,
      desk,
    });
    // SA pack emails count as sent to client for approval.
    if (desk === "sa") {
      await appendClientWorkLog({
        clientId: data.clientId,
        kind: "stage",
        label: "Sent to client for approval",
        detail: data.subject,
        desk: "sa",
      });
      const current = normalizeWorkStage(client.deskProfile?.workStage);
      if (
        current !== "submitted" &&
        current !== "completed" &&
        current !== "sent_for_approval"
      ) {
        await setClientWorkStage({
          clientId: data.clientId,
          stage: "sent_for_approval",
          note: "Self Assessment emailed to client",
          desk: "sa",
        }).catch(() => undefined);
      }
    }
  } catch {
    /* work log is best-effort */
  }

  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/communications`);

  return { ok: true as const, delivery: outbound.delivery, logId };
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
        error: "Not eligible for CT600 reminder this year",
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
    subject: "CT600 due — {{client_name}}",
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
  workStage?: string | null;
  vatStatus: VatWorkflowStatus | "not_started";
};

export type VatReminderMonth = CalendarReminderMonth;

function vatReminderMonths(now = new Date()): VatReminderMonth[] {
  return calendarYearReminderMonths(now);
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
  years: number[];
  defaultMonthKey: string;
  defaultYear: number;
}> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const now = new Date();
  const clients = await listClients();
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const candidates: BulkVatEmailCandidate[] = clients
    .filter(isVatRegisteredClient)
    .map((c) => {
      const workStage = normalizeWorkStage(c.deskProfile?.workStage);
      const workLog = c.deskProfile?.workLog ?? null;
      const portal = c.deskProfile?.portal ?? null;
      const vat = deriveVatClientSummary({
        workStage,
        workLog,
        portal,
        now,
      });
      return {
        clientId: c.id,
        slug: clientSlugFor({ id: c.id, name: c.name }, peers),
        name: c.name,
        vrn: c.vrn ?? null,
        contactEmail: c.contactEmail ?? null,
        workStage,
        vatStatus: vat.status,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

  const year = now.getFullYear();
  return {
    candidates,
    months: vatReminderMonths(now),
    years: [year, year + 1],
    defaultMonthKey: currentMonthKey(now),
    defaultYear: year,
  };
}

export async function getDefaultVatBulkEmailDraft(monthKey?: string) {
  const session = await requireSession();
  const sender = resolveClientEmailSender(session);
  const now = new Date();
  const months = vatReminderMonths(now);
  const fallbackKey = currentMonthKey(now);
  const month =
    months.find((m) => m.key === monthKey) ??
    months.find((m) => m.key === fallbackKey) ??
    months[0]!;
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


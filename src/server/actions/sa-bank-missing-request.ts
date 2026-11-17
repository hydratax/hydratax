"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { ensurePortal, patchDeskProfile } from "@/server/actions/desk";
import { sendClientCommunicationEmail } from "@/server/actions/client-communications";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { parseSaTaxYearLabel } from "@/lib/sa-tax-year";
import type { PortalRequest } from "@/lib/desk-profile";
import type { PracticeTask } from "@/lib/practice-tasks";
import { saMissingBankRequestId } from "@/lib/bank/sa-missing-bank-request";

const baseSchema = z.object({
  clientId: z.string().min(1),
  taxpayerId: z.string().min(1),
  taxYear: z.string().regex(/^\d{4}-\d{2}$/),
  /** Inclusive missing period (ISO yyyy-mm-dd). */
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Display phrase, e.g. Bank statements missing from 06 April to 28 Feb 2025 */
  periodPhrase: z.string().min(8),
});

const schema = baseSchema.extend({
  toEmail: z.string().email().optional(),
  /** Accountant-confirmed subject / body from the email popup. */
  subject: z.string().min(3).max(200).optional(),
  message: z.string().min(1).max(8000).optional(),
});

function draftMissingBankEmail(opts: {
  clientName: string;
  periodPhrase: string;
  periodStart: string;
  periodEnd: string;
  taxYear: string;
  uploadUrl: string;
  senderLine: string;
  practiceName: string;
}) {
  const subject = `${opts.periodPhrase} — ${opts.clientName}`;
  const body = `Dear ${opts.clientName},

${opts.periodPhrase}.

Please upload complete bank statements covering ${opts.periodStart} to ${opts.periodEnd} (tax year ${opts.taxYear}).

Upload securely here:
${opts.uploadUrl}

PDF statements or a bank export for that period are fine.

Kind regards,
${opts.senderLine}
${opts.practiceName}`.trim();
  return { subject, body };
}

/** Open the email popup with a ready draft (does not send). */
export async function previewMissingSaBankStatementsEmail(
  input: z.infer<typeof baseSchema> & { toEmail?: string },
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }
  const data = baseSchema
    .extend({ toEmail: z.string().email().optional() })
    .parse(input);
  if (!parseSaTaxYearLabel(data.taxYear)) {
    return { ok: false as const, error: "Invalid tax year." };
  }

  const client = await getClient(data.clientId);
  const toEmail = data.toEmail || client.contactEmail || "";
  const portal = await ensurePortal(data.clientId);
  const requestId = saMissingBankRequestId(data.taxpayerId, data.taxYear);
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://hydratax.uk"
  ).replace(/\/$/, "");
  const uploadUrl = `${appUrl}/portal/${portal.token}?request=${encodeURIComponent(requestId)}`;
  const draft = draftMissingBankEmail({
    clientName: client.name,
    periodPhrase: data.periodPhrase,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    taxYear: data.taxYear,
    uploadUrl,
    senderLine: session.email || "Your accountant",
    practiceName: session.practiceName ?? "",
  });

  return {
    ok: true as const,
    toEmail,
    subject: draft.subject,
    message: draft.body,
    uploadUrl,
    requestId,
    clientName: client.name,
  };
}

/**
 * Email the client for the exact missing bank period, with a portal upload link.
 * Adds/updates a portal checklist item keyed for that taxpayer + tax year.
 */
export async function requestMissingSaBankStatements(
  input: z.infer<typeof schema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }

  const data = schema.parse(input);
  const year = parseSaTaxYearLabel(data.taxYear);
  if (!year) return { ok: false as const, error: "Invalid tax year." };

  const client = await getClient(data.clientId);
  const toEmail = data.toEmail || client.contactEmail;
  if (!toEmail) {
    return {
      ok: false as const,
      error: "Add a contact email on the client before emailing.",
    };
  }

  const portal = await ensurePortal(data.clientId);
  const requestId = saMissingBankRequestId(data.taxpayerId, data.taxYear);
  const label = `Bank statements ${data.periodStart} to ${data.periodEnd} (SA ${data.taxYear})`;
  const requests: PortalRequest[] = [...(portal.requests ?? [])];
  const existingIdx = requests.findIndex((r) => r.id === requestId);
  if (existingIdx >= 0) {
    requests[existingIdx] = { id: requestId, label, done: false };
  } else {
    requests.unshift({ id: requestId, label, done: false });
  }

  await patchDeskProfile(data.clientId, {
    portal: { ...portal, requests },
    saBankChases: {
      ...(client.deskProfile?.saBankChases ?? {}),
      [requestId]: session.userId,
    },
  });

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://hydratax.uk"
  ).replace(/\/$/, "");
  const uploadUrl = `${appUrl}/portal/${portal.token}?request=${encodeURIComponent(requestId)}`;

  const draft = draftMissingBankEmail({
    clientName: client.name,
    periodPhrase: data.periodPhrase,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    taxYear: data.taxYear,
    uploadUrl,
    senderLine: session.email || "Your accountant",
    practiceName: session.practiceName ?? "",
  });
  const subject = data.subject?.trim() || draft.subject;
  const body = data.message?.trim() || draft.body;

  await sendClientCommunicationEmail({
    clientId: data.clientId,
    toEmail,
    subject,
    message: body,
    kind: "sa_missing_bank_statements",
    accountsDue: null,
    documentCount: 0,
  });

  const docRequestId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isMemoryStore() || isDemoMode()) {
    const store = demoStore as {
      documentRequests?: Array<Record<string, unknown>>;
    };
    store.documentRequests = [
      ...(store.documentRequests ?? []),
      {
        id: docRequestId,
        clientId: data.clientId,
        templateKey: "bank_statements_request",
        status: "requested",
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        subject,
        body,
        channel: "email",
        requestedAt: now,
        receivedAt: null,
        createdBy: session.userId,
        portalRequestId: requestId,
        taxpayerId: data.taxpayerId,
        taxYear: data.taxYear,
      },
    ];
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.from("client_document_requests").insert({
      id: docRequestId,
      practice_id: session.practiceId,
      client_id: data.clientId,
      template_key: "bank_statements_request",
      status: "requested",
      period_start: data.periodStart,
      period_end: data.periodEnd,
      subject,
      body,
      channel: "email",
      created_by: session.userId,
    });
  }

  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/self-assessment`);
  revalidatePath(`/clients/${data.clientId}/communications`);
  revalidatePath(`/clients/${data.clientId}/portal`);

  return {
    ok: true as const,
    message: `Emailed ${toEmail} for ${data.periodPhrase.toLowerCase()}.`,
    uploadUrl,
    requestId,
    toEmail,
    subject,
    sentAt: now,
  };
}

/** Create a practice-task notification when the client uploads missing SA bank papers. */
export async function notifySaBankStatementsUploaded(input: {
  practiceId: string;
  clientId: string;
  clientName: string;
  taxpayerId: string;
  taxYear: string;
  filename: string;
  documentId: string;
  assigneeUserId: string | null;
  periodLabel?: string;
}): Promise<PracticeTask | null> {
  const now = new Date().toISOString();
  const title = `Bank statements uploaded — SA ${input.taxYear}`;
  const body = [
    `${input.clientName} uploaded ${input.filename}`,
    input.periodLabel ? `Period: ${input.periodLabel}` : null,
    `Taxpayer: ${input.taxpayerId}`,
    `Document id: ${input.documentId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const task: PracticeTask = {
    id: crypto.randomUUID(),
    practiceId: input.practiceId,
    kind: "document",
    status: input.assigneeUserId ? "allocated" : "unallocated",
    title,
    body,
    fromAddress: "client-portal",
    source: "manual",
    sourceEmailId: null,
    clientId: input.clientId,
    clientName: input.clientName,
    assigneeUserId: input.assigneeUserId,
    allocatedBy: input.assigneeUserId,
    allocatedAt: input.assigneeUserId ? now : null,
    filename: input.filename,
    contentType: null,
    storageKey: null,
    byteSize: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isDemoMode() || isMemoryStore()) {
    const { memoryStore } = await import("@/server/demo/store");
    memoryStore.practiceTasks.push(task);
    return task;
  }

  if (!isSupabaseConfigured()) return task;

  const { getSupabaseAdmin } = await import("@/lib/supabase");
  const { error } = await getSupabaseAdmin().from("practice_tasks").insert({
    id: task.id,
    practice_id: task.practiceId,
    kind: task.kind,
    status: task.status,
    title: task.title,
    body: task.body,
    from_address: task.fromAddress,
    source: task.source,
    source_email_id: null,
    client_id: task.clientId,
    assignee_user_id: task.assigneeUserId,
    allocated_by: task.allocatedBy,
    allocated_at: task.allocatedAt,
    filename: task.filename,
    content_type: null,
    storage_key: null,
    byte_size: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  });
  if (error) {
    console.error("[sa-bank] notify task insert failed", error.message);
    return null;
  }
  return task;
}

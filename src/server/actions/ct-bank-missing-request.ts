"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { ensurePortal, patchDeskProfile } from "@/server/actions/desk";
import { sendClientCommunicationEmail } from "@/server/actions/client-communications";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import type { PortalRequest } from "@/lib/desk-profile";
import { ctMissingBankRequestId } from "@/lib/bank/ct-missing-bank-request";

const baseSchema = z.object({
  clientId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodPhrase: z.string().min(8),
});

const schema = baseSchema.extend({
  toEmail: z.string().email().optional(),
  subject: z.string().min(3).max(200).optional(),
  message: z.string().min(1).max(8000).optional(),
});

function draftCtMissingBankEmail(opts: {
  clientName: string;
  periodPhrase: string;
  periodStart: string;
  periodEnd: string;
  uploadUrl: string;
  senderLine: string;
  practiceName: string;
}) {
  const subject = `${opts.periodPhrase} — ${opts.clientName}`;
  const body = `Dear ${opts.clientName},

${opts.periodPhrase}.

To prepare your company accounts and Corporation Tax return, please upload complete bank statements covering ${opts.periodStart} to ${opts.periodEnd}.

Upload securely here:
${opts.uploadUrl}

PDF statements or a bank export for that full period are fine.

Kind regards,
${opts.senderLine}
${opts.practiceName}`.trim();
  return { subject, body };
}

export async function previewMissingCtBankStatementsEmail(
  input: z.infer<typeof baseSchema> & { toEmail?: string },
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }
  const data = baseSchema
    .extend({ toEmail: z.string().email().optional() })
    .parse(input);

  const client = await getClient(data.clientId);
  const toEmail = data.toEmail || client.contactEmail || "";
  const portal = await ensurePortal(data.clientId);
  const requestId = ctMissingBankRequestId(
    data.clientId,
    data.periodStart,
    data.periodEnd,
  );
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://hydratax.uk"
  ).replace(/\/$/, "");
  const uploadUrl = `${appUrl}/portal/${portal.token}?request=${encodeURIComponent(requestId)}`;
  const draft = draftCtMissingBankEmail({
    clientName: client.name,
    periodPhrase: data.periodPhrase,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
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

export async function requestMissingCtBankStatements(
  input: z.infer<typeof schema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }

  const data = schema.parse(input);
  const client = await getClient(data.clientId);
  const toEmail = data.toEmail || client.contactEmail;
  if (!toEmail) {
    return {
      ok: false as const,
      error: "Add a contact email on the client before emailing.",
    };
  }

  const portal = await ensurePortal(data.clientId);
  const requestId = ctMissingBankRequestId(
    data.clientId,
    data.periodStart,
    data.periodEnd,
  );
  const label = `Bank statements ${data.periodStart} to ${data.periodEnd} (accounts / CT)`;
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
  const draft = draftCtMissingBankEmail({
    clientName: client.name,
    periodPhrase: data.periodPhrase,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
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
    kind: "ct_missing_bank_statements",
    accountsDue: client.companiesHouse?.accountsNextDue ?? null,
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
  revalidatePath(`/clients/${data.clientId}/bank`);
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

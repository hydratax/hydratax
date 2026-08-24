"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { deleteClient, getClient, listClients } from "@/server/actions/clients";
import { sendClientCommunicationEmail } from "@/server/actions/client-communications";
import {
  SYSTEM_CORRESPONDENCE_TEMPLATES,
  accountingPeriodFromCompaniesHouse,
  applyTemplate,
  documentStatusLabel,
  type CorrespondenceTemplateKey,
  type DocumentRequestStatus,
} from "@/lib/correspondence-templates";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";
import { demoStore } from "@/server/demo/store";
import { clientSlugFor } from "@/lib/client-slug";

export type DocumentRequestRecord = {
  id: string;
  clientId: string;
  templateKey: string;
  status: DocumentRequestStatus;
  periodStart: string | null;
  periodEnd: string | null;
  subject: string | null;
  body: string | null;
  channel: string;
  requestedAt: string;
  receivedAt: string | null;
};

export type ChannelConnectionRecord = {
  channel: "whatsapp" | "email";
  status: string;
  displayName: string | null;
  externalAccountId: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown>;
};

export type ChannelMessageRecord = {
  id: string;
  clientId: string | null;
  channel: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddress: string | null;
  subject: string | null;
  bodyPreview: string | null;
  bodyText: string | null;
  matchedBy: string | null;
  sentAt: string;
};

type SoftClient = {
  companiesHouse?: ClientCompaniesHouseSnapshot | null;
  contactPhone?: string | null;
  documentStatus?: string | null;
};

function periodForClient(client: {
  companiesHouse?: ClientCompaniesHouseSnapshot | null;
}) {
  const ch = client.companiesHouse;
  return accountingPeriodFromCompaniesHouse({
    incorporatedOn: ch?.incorporatedOn,
    accountsPeriodEnd: ch?.accountsPeriodEnd,
    lastAccountsMadeUpTo: ch?.lastAccountsMadeUpTo,
  });
}

async function setClientDocumentStatus(
  clientId: string,
  practiceId: string,
  status: DocumentRequestStatus,
) {
  if (isMemoryStore() || isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === clientId) as
      | (SoftClient & { id: string })
      | undefined;
    if (row) row.documentStatus = status;
    return;
  }
  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase
      .from("clients")
      .update({
        document_status: status,
        document_status_updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("practice_id", practiceId);
  }
}

export async function listCorrespondenceTemplates() {
  await requireSession();
  return SYSTEM_CORRESPONDENCE_TEMPLATES;
}

export async function previewCorrespondenceTemplate(input: {
  clientId: string;
  templateKey: CorrespondenceTemplateKey;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  const def = SYSTEM_CORRESPONDENCE_TEMPLATES.find(
    (t) => t.key === input.templateKey,
  );
  if (!def) throw new Error("Unknown template");

  const period = periodForClient(client);
  const vars = {
    client_name: client.name,
    company_number: client.companyNumber ?? "",
    practice_name: session.practiceName,
    sender_name: session.email?.split("@")[0] ?? session.practiceName,
    accounts_due: client.companiesHouse?.accountsNextDue
      ? new Date(client.companiesHouse.accountsNextDue).toLocaleDateString(
          "en-GB",
          { day: "numeric", month: "long", year: "numeric" },
        )
      : "",
    period_start: period.periodStartLabel,
    period_end: period.periodEndLabel,
    year_end: period.yearEndLabel,
  };

  return {
    subject: applyTemplate(def.subject, vars),
    body: applyTemplate(def.body, vars),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    yearEnd: period.yearEnd,
    templateName: def.name,
  };
}

export async function recordChannelMessage(input: {
  clientId: string | null;
  channel: "whatsapp" | "email";
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddress?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  externalId?: string | null;
  threadId?: string | null;
  matchedBy?: string | null;
  sentAt?: string;
}) {
  const session = await requireSession();
  const id = crypto.randomUUID();
  const sentAt = input.sentAt ?? new Date().toISOString();
  const preview = (input.bodyText ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  if (isMemoryStore() || isDemoMode()) {
    const store = demoStore as { channelMessages?: ChannelMessageRecord[] };
    store.channelMessages = [
      ...(store.channelMessages ?? []),
      {
        id,
        clientId: input.clientId,
        channel: input.channel,
        direction: input.direction,
        fromAddress: input.fromAddress,
        toAddress: input.toAddress ?? null,
        subject: input.subject ?? null,
        bodyPreview: preview || null,
        bodyText: input.bodyText ?? null,
        matchedBy: input.matchedBy ?? null,
        sentAt,
      },
    ];
    return id;
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase.from("client_channel_messages").upsert(
      {
        id,
        practice_id: session.practiceId,
        client_id: input.clientId,
        channel: input.channel,
        direction: input.direction,
        from_address: input.fromAddress,
        to_address: input.toAddress ?? null,
        subject: input.subject ?? null,
        body_text: input.bodyText ?? null,
        body_preview: preview || null,
        external_id: input.externalId ?? id,
        thread_id: input.threadId ?? null,
        matched_by: input.matchedBy ?? null,
        sent_at: sentAt,
      },
      { onConflict: "practice_id,channel,external_id" },
    );
    if (error) throw new Error(error.message);
  }

  return id;
}

export async function sendTemplatedCorrespondence(input: {
  clientId: string;
  templateKey: CorrespondenceTemplateKey;
  channel?: "email" | "whatsapp";
  toEmail?: string;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const client = await getClient(input.clientId);
  const preview = await previewCorrespondenceTemplate({
    clientId: input.clientId,
    templateKey: input.templateKey,
  });

  const channel = input.channel ?? "email";
  const toEmail = input.toEmail || client.contactEmail;

  if (channel === "email") {
    if (!toEmail) {
      throw new Error("Add a contact email on the client before sending.");
    }
    await sendClientCommunicationEmail({
      clientId: input.clientId,
      toEmail,
      subject: preview.subject,
      message: preview.body,
      kind: `template:${input.templateKey}`,
      accountsDue: client.companiesHouse?.accountsNextDue ?? null,
      documentCount: 0,
    });
  } else {
    const phone =
      (client as SoftClient).contactPhone ?? client.contactEmail ?? "unknown";
    await recordChannelMessage({
      clientId: input.clientId,
      channel: "whatsapp",
      direction: "outbound",
      fromAddress: session.email ?? "practice",
      toAddress: phone,
      subject: preview.subject,
      bodyText: preview.body,
      matchedBy: "manual_send",
    });
  }

  const requestId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (isMemoryStore() || isDemoMode()) {
    const store = demoStore as { documentRequests?: DocumentRequestRecord[] };
    store.documentRequests = [
      ...(store.documentRequests ?? []),
      {
        id: requestId,
        clientId: input.clientId,
        templateKey: input.templateKey,
        status: "requested",
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        subject: preview.subject,
        body: preview.body,
        channel,
        requestedAt: now,
        receivedAt: null,
      },
    ];
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.from("client_document_requests").insert({
      id: requestId,
      practice_id: session.practiceId,
      client_id: input.clientId,
      template_key: input.templateKey,
      status: "requested",
      period_start: preview.periodStart,
      period_end: preview.periodEnd,
      subject: preview.subject,
      body: preview.body,
      channel,
      created_by: session.userId,
    });
  }

  if (input.templateKey === "bank_statements_request") {
    await setClientDocumentStatus(
      input.clientId,
      session.practiceId,
      "requested",
    );
  }

  revalidatePath(`/clients/${input.clientId}`);
  revalidatePath(`/clients/${input.clientId}/communications`);
  revalidatePath("/clients");

  return {
    ok: true as const,
    requestId,
    statusLabel: documentStatusLabel("requested"),
    preview,
  };
}

export async function markDocumentRequestReceived(input: {
  clientId: string;
  requestId?: string;
  status?: DocumentRequestStatus;
}) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  await getClient(input.clientId);
  const status = input.status ?? "received";
  const now = new Date().toISOString();

  if (isMemoryStore() || isDemoMode()) {
    const list =
      (demoStore as { documentRequests?: DocumentRequestRecord[] })
        .documentRequests ?? [];
    for (const r of list) {
      if (
        r.clientId === input.clientId &&
        (!input.requestId || r.id === input.requestId)
      ) {
        r.status = status;
        r.receivedAt = now;
      }
    }
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    let q = supabase
      .from("client_document_requests")
      .update({
        status,
        received_at:
          status === "received" || status === "partial" ? now : null,
        updated_at: now,
      })
      .eq("client_id", input.clientId)
      .eq("practice_id", session.practiceId);
    if (input.requestId) q = q.eq("id", input.requestId);
    else q = q.eq("status", "requested");
    await q;
  }

  await setClientDocumentStatus(input.clientId, session.practiceId, status);
  revalidatePath(`/clients/${input.clientId}`);
  revalidatePath(`/clients/${input.clientId}/communications`);
  revalidatePath("/clients");
  return { ok: true as const, statusLabel: documentStatusLabel(status) };
}

export async function listClientDocumentRequests(clientId: string) {
  const session = await requireSession();
  await getClient(clientId);

  if (isMemoryStore() || isDemoMode()) {
    return (
      (demoStore as { documentRequests?: DocumentRequestRecord[] })
        .documentRequests ?? []
    )
      .filter((r) => r.clientId === clientId)
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_document_requests")
      .select("*")
      .eq("client_id", clientId)
      .eq("practice_id", session.practiceId)
      .order("requested_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      clientId: row.client_id as string,
      templateKey: row.template_key as string,
      status: row.status as DocumentRequestStatus,
      periodStart: (row.period_start as string | null) ?? null,
      periodEnd: (row.period_end as string | null) ?? null,
      subject: (row.subject as string | null) ?? null,
      body: (row.body as string | null) ?? null,
      channel: row.channel as string,
      requestedAt: row.requested_at as string,
      receivedAt: (row.received_at as string | null) ?? null,
    }));
  }

  return [];
}

export async function listClientChannelMessages(clientId: string) {
  const session = await requireSession();
  await getClient(clientId);

  if (isMemoryStore() || isDemoMode()) {
    return (
      (demoStore as { channelMessages?: ChannelMessageRecord[] })
        .channelMessages ?? []
    )
      .filter((m) => m.clientId === clientId)
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("client_channel_messages")
      .select("*")
      .eq("client_id", clientId)
      .eq("practice_id", session.practiceId)
      .order("sent_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      clientId: (row.client_id as string | null) ?? null,
      channel: row.channel as string,
      direction: row.direction as "inbound" | "outbound",
      fromAddress: row.from_address as string,
      toAddress: (row.to_address as string | null) ?? null,
      subject: (row.subject as string | null) ?? null,
      bodyPreview: (row.body_preview as string | null) ?? null,
      bodyText: (row.body_text as string | null) ?? null,
      matchedBy: (row.matched_by as string | null) ?? null,
      sentAt: row.sent_at as string,
    }));
  }

  return [];
}

export async function listChannelConnections(): Promise<
  ChannelConnectionRecord[]
> {
  return listChannelConnectionsInner();
}

async function listChannelConnectionsInner(): Promise<
  ChannelConnectionRecord[]
> {
  const session = await requireSession();

  if (isMemoryStore() || isDemoMode()) {
    return (
      (demoStore as { channelConnections?: ChannelConnectionRecord[] })
        .channelConnections ?? []
    );
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("practice_channel_connections")
      .select("*")
      .eq("practice_id", session.practiceId);
    return (data ?? []).map((row) => ({
      channel: row.channel as "whatsapp" | "email",
      status: row.status as string,
      displayName: (row.display_name as string | null) ?? null,
      externalAccountId: (row.external_account_id as string | null) ?? null,
      connectedAt: (row.connected_at as string | null) ?? null,
      lastSyncedAt: (row.last_synced_at as string | null) ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));
  }

  return [];
}

const connectSchema = z.object({
  channel: z.enum(["whatsapp", "email"]),
  displayName: z.string().min(1).max(200),
  externalAccountId: z.string().min(3).max(200),
  apiToken: z.string().optional(),
});

export async function connectPracticeChannel(
  input: z.infer<typeof connectSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = connectSchema.parse(input);
  const now = new Date().toISOString();

  if (isMemoryStore() || isDemoMode()) {
    const store = demoStore as {
      channelConnections?: ChannelConnectionRecord[];
    };
    store.channelConnections = [
      ...(store.channelConnections ?? []).filter(
        (c) => c.channel !== data.channel,
      ),
      {
        channel: data.channel,
        status: "connected",
        displayName: data.displayName,
        externalAccountId: data.externalAccountId,
        connectedAt: now,
        lastSyncedAt: null,
        metadata: data.apiToken ? { hasToken: true } : {},
      },
    ];
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase
      .from("practice_channel_connections")
      .upsert(
        {
          practice_id: session.practiceId,
          channel: data.channel,
          status: "connected",
          display_name: data.displayName,
          external_account_id: data.externalAccountId,
          credentials_encrypted: data.apiToken ?? null,
          metadata: data.apiToken ? { hasToken: true } : {},
          connected_by: session.userId,
          connected_at: now,
          updated_at: now,
        },
        { onConflict: "practice_id,channel" },
      );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/settings/channels");
  return { ok: true as const };
}

export async function disconnectPracticeChannel(
  channel: "whatsapp" | "email",
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  if (isMemoryStore() || isDemoMode()) {
    const store = demoStore as {
      channelConnections?: ChannelConnectionRecord[];
    };
    store.channelConnections = (store.channelConnections ?? []).filter(
      (c) => c.channel !== channel,
    );
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase
      .from("practice_channel_connections")
      .update({
        status: "disconnected",
        credentials_encrypted: null,
        updated_at: new Date().toISOString(),
      })
      .eq("practice_id", session.practiceId)
      .eq("channel", channel);
  }

  revalidatePath("/settings/channels");
  return { ok: true as const };
}

export async function ingestInboundMessage(input: {
  channel: "whatsapp" | "email";
  fromAddress: string;
  toAddress?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  externalId: string;
  sentAt?: string;
}) {
  await requireSession();
  const clients = await listClients();
  const from = input.fromAddress.trim().toLowerCase();
  const digits = from.replace(/\D/g, "");

  let matched =
    clients.find(
      (c) => c.contactEmail && c.contactEmail.toLowerCase() === from,
    ) ?? null;

  if (!matched && input.channel === "whatsapp" && digits.length >= 8) {
    matched =
      clients.find((c) => {
        const phone = (c as SoftClient).contactPhone;
        if (!phone) return false;
        return phone.replace(/\D/g, "").endsWith(digits.slice(-9));
      }) ?? null;
  }

  const id = await recordChannelMessage({
    clientId: matched?.id ?? null,
    channel: input.channel,
    direction: "inbound",
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    subject: input.subject,
    bodyText: input.bodyText,
    externalId: input.externalId,
    matchedBy: matched
      ? input.channel === "email"
        ? "contact_email"
        : "contact_phone"
      : "unmatched",
    sentAt: input.sentAt,
  });

  if (matched) {
    const body = (input.bodyText ?? "").toLowerCase();
    const subject = (input.subject ?? "").toLowerCase();
    const looksLikeStatements =
      body.includes("statement") ||
      body.includes("bank") ||
      subject.includes("statement");

    if (looksLikeStatements) {
      const open = await listClientDocumentRequests(matched.id);
      const pending = open.find(
        (r) =>
          r.templateKey === "bank_statements_request" &&
          r.status === "requested",
      );
      if (pending) {
        await markDocumentRequestReceived({
          clientId: matched.id,
          requestId: pending.id,
          status: "received",
        });
      }
    }
  }

  revalidatePath("/clients");
  if (matched) {
    revalidatePath(`/clients/${matched.id}/communications`);
  }

  return {
    id,
    matchedClientId: matched?.id ?? null,
    matchedClientName: matched?.name ?? null,
  };
}

export async function dedupePracticeClients() {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const clients = await listClients();
  const byCo = new Map<string, Array<{ id: string; createdAt: string | Date }>>();
  for (const c of clients) {
    if (!c.companyNumber) continue;
    const key = c.companyNumber.replace(/\s/g, "").toUpperCase();
    const list = byCo.get(key) ?? [];
    list.push({ id: c.id, createdAt: c.createdAt });
    byCo.set(key, list);
  }

  let removed = 0;
  for (const [, group] of byCo) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) =>
      String(a.createdAt).localeCompare(String(b.createdAt)),
    );
    for (const dup of sorted.slice(1)) {
      await deleteClient(dup.id);
      removed += 1;
    }
  }

  revalidatePath("/clients");
  return { removed };
}

export async function getClientCorrespondenceContext(clientId: string) {
  const client = await getClient(clientId);
  const period = periodForClient(client);
  const peers = (await listClients()).map((c) => ({ id: c.id, name: c.name }));
  const status =
    ((client as SoftClient).documentStatus as DocumentRequestStatus) ?? "none";
  return {
    clientId: client.id,
    slug: clientSlugFor({ id: client.id, name: client.name }, peers),
    name: client.name,
    contactEmail: client.contactEmail ?? null,
    contactPhone: (client as SoftClient).contactPhone ?? null,
    documentStatus: status,
    documentStatusLabel: documentStatusLabel(status),
    period,
  };
}

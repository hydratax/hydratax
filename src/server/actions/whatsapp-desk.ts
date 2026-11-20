"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/admin";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import {
  normalizeWhatsAppPhone,
  sendWhatsAppDocument,
  sendWhatsAppMessage,
  whatsappPlatformConfigured,
} from "@/lib/whatsapp";
import {
  consumeWhatsAppQuota,
  getPracticeWhatsAppAllocation,
  listPracticesForWhatsAppAdmin,
  listWhatsAppAllocations,
  upsertPracticeWhatsAppAllocation,
  type WhatsAppAllocation,
} from "@/server/whatsapp/quota";
import { recordChannelMessage } from "@/server/actions/correspondence";
import { isDemoMode, isMemoryStore, isSupabaseConfigured } from "@/lib/env";

export type { WhatsAppAllocation };

function clientPhone(client: {
  contactPhone?: string | null;
  phone?: string | null;
}): string | null {
  const raw = client.contactPhone || client.phone || null;
  if (!raw) return null;
  const digits = normalizeWhatsAppPhone(raw);
  return digits.length >= 10 ? digits : null;
}

async function logSend(opts: {
  practiceId: string;
  clientId: string | null;
  kind: "text" | "document";
  toPhone: string;
  bodyPreview?: string | null;
  filename?: string | null;
  metaMessageId?: string | null;
  status: "sent" | "failed";
  errorDetail?: string | null;
  createdBy?: string | null;
}) {
  if (isMemoryStore() || isDemoMode()) return;
  if (!isSupabaseConfigured()) return;
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    await getSupabaseAdmin().from("practice_whatsapp_sends").insert({
      practice_id: opts.practiceId,
      client_id: opts.clientId,
      kind: opts.kind,
      to_phone: opts.toPhone,
      body_preview: opts.bodyPreview ?? null,
      filename: opts.filename ?? null,
      meta_message_id: opts.metaMessageId ?? null,
      status: opts.status,
      error_detail: opts.errorDetail ?? null,
      created_by: opts.createdBy ?? null,
    });
  } catch {
    /* best-effort audit */
  }
}

export async function getMyWhatsAppAllocation() {
  const session = await requireSession();
  const allocation = await getPracticeWhatsAppAllocation(session.practiceId);
  return {
    platformReady: whatsappPlatformConfigured(),
    allocation,
  };
}

export async function adminListWhatsAppAllocations() {
  await requireAdmin();
  const [allocations, practices, platformReady] = await Promise.all([
    listWhatsAppAllocations(),
    listPracticesForWhatsAppAdmin(),
    Promise.resolve(whatsappPlatformConfigured()),
  ]);
  return { allocations, practices, platformReady };
}

const assignSchema = z.object({
  practiceId: z.string().uuid().or(z.string().min(3)),
  enabled: z.boolean(),
  monthlyMessageLimit: z.number().int().min(0).max(1_000_000),
  monthlyDocumentLimit: z.number().int().min(0).max(1_000_000),
  label: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  rotateApiKey: z.boolean().optional(),
});

export async function adminAssignWhatsAppAllocation(
  input: z.infer<typeof assignSchema>,
) {
  const session = await requireAdmin();
  const data = assignSchema.parse(input);
  const result = await upsertPracticeWhatsAppAllocation({
    practiceId: data.practiceId,
    enabled: data.enabled,
    monthlyMessageLimit: data.monthlyMessageLimit,
    monthlyDocumentLimit: data.monthlyDocumentLimit,
    label: data.label ?? null,
    notes: data.notes ?? null,
    assignedBy: session.userId,
    rotateApiKey: data.rotateApiKey ?? false,
  });
  revalidatePath("/admin/whatsapp");
  revalidatePath("/settings/channels");
  return result;
}

const textSchema = z.object({
  clientId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

/** Send a text reminder / note via HydraTax’s shared WhatsApp number. */
export async function sendClientWhatsAppText(
  input: z.infer<typeof textSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = textSchema.parse(input);

  if (!whatsappPlatformConfigured()) {
    throw new Error("WhatsApp is not configured on the platform");
  }

  const client = await getClient(data.clientId);
  const phone = clientPhone(
    client as { contactPhone?: string | null; phone?: string | null },
  );
  if (!phone) {
    throw new Error("Add a mobile number on the client card first");
  }

  await consumeWhatsAppQuota({
    practiceId: session.practiceId,
    documents: 0,
  });

  const prefixed = `From ${session.practiceName || "your accountant"} (via HydraTax):\n\n${data.message}`;
  const res = await sendWhatsAppMessage(phone, prefixed);

  await logSend({
    practiceId: session.practiceId,
    clientId: data.clientId,
    kind: "text",
    toPhone: phone,
    bodyPreview: data.message.slice(0, 280),
    metaMessageId: res.messageId ?? null,
    status: res.ok ? "sent" : "failed",
    errorDetail: res.ok ? null : res.body.slice(0, 500),
    createdBy: session.userId,
  });

  if (!res.ok) {
    throw new Error("WhatsApp could not deliver this message");
  }

  await recordChannelMessage({
    clientId: data.clientId,
    channel: "whatsapp",
    direction: "outbound",
    fromAddress: "hydratax-whatsapp",
    toAddress: phone,
    subject: null,
    bodyText: data.message,
    externalId: res.messageId ?? undefined,
    matchedBy: "desk_send",
  });

  revalidatePath(`/clients/${data.clientId}`);
  return { ok: true as const, messageId: res.messageId ?? null };
}

const docSchema = z.object({
  clientId: z.string().min(1),
  filename: z.string().min(1).max(240),
  base64: z.string().min(16),
  mimeType: z.string().optional(),
  caption: z.string().max(1000).optional(),
});

/** Send a PDF (or other file) via HydraTax’s shared WhatsApp number. */
export async function sendClientWhatsAppDocument(
  input: z.infer<typeof docSchema>,
) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = docSchema.parse(input);

  if (!whatsappPlatformConfigured()) {
    throw new Error("WhatsApp is not configured on the platform");
  }

  const client = await getClient(data.clientId);
  const phone = clientPhone(
    client as { contactPhone?: string | null; phone?: string | null },
  );
  if (!phone) {
    throw new Error("Add a mobile number on the client card first");
  }

  await consumeWhatsAppQuota({
    practiceId: session.practiceId,
    documents: 1,
  });

  const bytes = Buffer.from(data.base64, "base64");
  if (bytes.length > 64 * 1024 * 1024) {
    throw new Error("File is too large for WhatsApp");
  }

  const caption =
    data.caption?.trim() ||
    `${data.filename} from ${session.practiceName || "your accountant"} (via HydraTax)`;

  const res = await sendWhatsAppDocument({
    to: phone,
    filename: data.filename,
    bytes,
    mimeType: data.mimeType || "application/pdf",
    caption,
  });

  await logSend({
    practiceId: session.practiceId,
    clientId: data.clientId,
    kind: "document",
    toPhone: phone,
    bodyPreview: caption.slice(0, 280),
    filename: data.filename,
    metaMessageId: res.messageId ?? null,
    status: res.ok ? "sent" : "failed",
    errorDetail: res.ok ? null : res.body.slice(0, 500),
    createdBy: session.userId,
  });

  if (!res.ok) {
    throw new Error("WhatsApp could not deliver this document");
  }

  await recordChannelMessage({
    clientId: data.clientId,
    channel: "whatsapp",
    direction: "outbound",
    fromAddress: "hydratax-whatsapp",
    toAddress: phone,
    subject: data.filename,
    bodyText: caption,
    externalId: res.messageId ?? undefined,
    matchedBy: "desk_send",
  });

  revalidatePath(`/clients/${data.clientId}`);
  return { ok: true as const, messageId: res.messageId ?? null };
}

const saSchema = z.object({
  clientId: z.string().min(1),
  returnId: z.string().min(1),
  docs: z.array(z.enum(["sa100", "sa302"])).min(1),
  caption: z.string().max(1000).optional(),
});

/** Build SA100/SA302 PDFs and send each via WhatsApp (document quota). */
export async function sendSaPdfsViaWhatsApp(input: z.infer<typeof saSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = saSchema.parse(input);

  const client = await getClient(data.clientId);
  const phone = clientPhone(
    client as { contactPhone?: string | null; phone?: string | null },
  );
  if (!phone) {
    throw new Error("Add a mobile number on the client card first");
  }
  if (!whatsappPlatformConfigured()) {
    throw new Error("WhatsApp is not configured on the platform");
  }

  const files: Array<{ filename: string; base64: string; mimeType: string }> =
    [];
  const { protectClientPdf } = await import("@/server/pdf/lock-for-client");

  if (data.returnId.startsWith("doc-")) {
    const documentId = data.returnId.slice("doc-".length);
    const { listSaFiledDocuments } = await import("@/server/actions/sa100");
    const { readClientDocumentBytes } = await import(
      "@/server/documents/read-bytes"
    );
    const filed = await listSaFiledDocuments(data.clientId);
    const sa100Doc = filed.find(
      (d) => d.id === documentId && d.kind === "return",
    );
    const taxYear = sa100Doc?.taxYear;
    const sa302Doc = taxYear
      ? filed.find((d) => d.taxYear === taxYear && d.kind === "sa302")
      : undefined;
    for (const kind of data.docs) {
      const doc = kind === "sa100" ? sa100Doc : sa302Doc;
      if (!doc) continue;
      const file = await readClientDocumentBytes({
        clientId: data.clientId,
        documentId: doc.id,
      });
      const pdfFilename = file.filename.toLowerCase().endsWith(".pdf")
        ? file.filename
        : `${file.filename}.pdf`;
      const protectedPdf = await protectClientPdf({
        clientId: data.clientId,
        pdfBytes: file.bytes,
        pdfFilename,
        section: "sa",
        requireLock: true,
      });
      files.push({
        filename: protectedPdf.locked
          ? protectedPdf.pack.filename
          : protectedPdf.filename,
        base64: (protectedPdf.locked
          ? protectedPdf.pack.bytes
          : protectedPdf.bytes
        ).toString("base64"),
        mimeType: protectedPdf.locked
          ? protectedPdf.pack.contentType
          : protectedPdf.contentType,
      });
    }
  } else {
    const { getSa100Return } = await import("@/server/actions/sa100");
    const { buildSa302Pdf } = await import("@/server/sa100/pdf");
    const { buildSa100PackPdf } = await import("@/server/sa100/pack");
    const row = await getSa100Return(data.clientId, data.returnId);
    const taxpayerName =
      row.draft.declarationName?.trim() ||
      (client.type === "limited_company" ? "" : client.name);
    const meta = {
      submissionRef: row.hmrcCorrelationId ?? null,
      status: row.status,
      taxYear: row.taxYear,
    };
    const personalUtr = row.draft.utr || client.utr || null;
    for (const doc of data.docs) {
      if (doc === "sa302") {
        const bytes = await buildSa302Pdf(
          row.calculation,
          taxpayerName,
          row.draft.utr || client.utr || "",
          meta,
        );
        const protectedPdf = await protectClientPdf({
          clientId: data.clientId,
          pdfBytes: bytes,
          pdfFilename: `SA302-${row.taxYear}.pdf`,
          section: "sa",
          dateOfBirth: row.draft.dateOfBirth,
          personalUtr,
          requireLock: true,
        });
        files.push({
          filename: protectedPdf.locked
            ? protectedPdf.pack.filename
            : protectedPdf.filename,
          base64: (protectedPdf.locked
            ? protectedPdf.pack.bytes
            : protectedPdf.bytes
          ).toString("base64"),
          mimeType: protectedPdf.locked
            ? protectedPdf.pack.contentType
            : protectedPdf.contentType,
        });
      } else {
        const { bytes } = await buildSa100PackPdf(
          row.draft,
          taxpayerName,
          meta,
        );
        const protectedPdf = await protectClientPdf({
          clientId: data.clientId,
          pdfBytes: bytes,
          pdfFilename: `SA100-${row.taxYear}.pdf`,
          section: "sa",
          dateOfBirth: row.draft.dateOfBirth,
          personalUtr,
          requireLock: true,
        });
        files.push({
          filename: protectedPdf.locked
            ? protectedPdf.pack.filename
            : protectedPdf.filename,
          base64: (protectedPdf.locked
            ? protectedPdf.pack.bytes
            : protectedPdf.bytes
          ).toString("base64"),
          mimeType: protectedPdf.locked
            ? protectedPdf.pack.contentType
            : protectedPdf.contentType,
        });
      }
    }
  }

  if (!files.length) {
    throw new Error("No SA PDFs available to send");
  }

  let sent = 0;
  for (const file of files) {
    await sendClientWhatsAppDocument({
      clientId: data.clientId,
      filename: file.filename,
      base64: file.base64,
      mimeType: file.mimeType,
      caption:
        data.caption ||
        `${file.filename} from ${session.practiceName || "your accountant"}`,
    });
    sent += 1;
  }

  return { ok: true as const, sent };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import {
  memoryStore,
  type MemoryInvoice,
  type MemoryInvoiceLineTemplate,
} from "@/server/demo/store";
import { poundsToPence, vatOnNet } from "@/server/money/pence";
import { appendAuditEvent } from "@/server/audit/log";
import { isSupabaseConfigured } from "@/lib/env";

const lineSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.coerce.number().positive().max(100000),
  unitPricePounds: z.string().min(1),
  vatRateBps: z.union([z.literal(0), z.literal(500), z.literal(2000)]),
});

const createSchema = z.object({
  clientId: z.string().min(1),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).optional(),
  reference: z.string().max(120).optional(),
  paymentInstructions: z.string().max(1000).optional(),
  status: z.enum(["draft", "sent", "due"]).default("due"),
  lines: z.array(lineSchema).min(1).max(50),
});

const templateSchema = z.object({
  label: z.string().max(80).optional(),
  description: z.string().min(1).max(300),
  quantity: z.coerce.number().positive().max(100000).default(1),
  unitPricePounds: z.string().min(1),
  vatRateBps: z.union([z.literal(0), z.literal(500), z.literal(2000)]),
});

function nextInvoiceNumber(practiceId: string) {
  const count =
    memoryStore.invoices.filter((i) => i.practiceId === practiceId).length + 1;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count).padStart(4, "0")}`;
}

function mapInvoiceRow(r: Record<string, unknown>): MemoryInvoice {
  return {
    id: String(r.id),
    practiceId: String(r.practice_id),
    clientId: String(r.client_id),
    invoiceNumber: String(r.invoice_number),
    status: r.status as MemoryInvoice["status"],
    issueDate: String(r.issue_date),
    dueDate: String(r.due_date),
    currency: String(r.currency ?? "gbp"),
    subtotalPence: Number(r.subtotal_pence ?? 0),
    vatPence: Number(r.vat_pence ?? 0),
    totalPence: Number(r.total_pence ?? 0),
    notes: (r.notes as string | null) ?? null,
    reference: (r.reference as string | null) ?? null,
    paymentInstructions: (r.payment_instructions as string | null) ?? null,
    lines: (r.line_items as MemoryInvoice["lines"]) ?? [],
    createdBy: String(r.created_by ?? ""),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapTemplateRow(r: Record<string, unknown>): MemoryInvoiceLineTemplate {
  return {
    id: String(r.id),
    practiceId: String(r.practice_id),
    label: (r.label as string | null) ?? null,
    description: String(r.description),
    quantity: Number(r.quantity ?? 1),
    unitPricePence: Number(r.unit_price_pence ?? 0),
    vatRateBps: Number(r.vat_rate_bps ?? 2000) as 0 | 500 | 2000,
    createdBy: String(r.created_by ?? ""),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function listClientInvoices(clientId: string) {
  const session = await requireModule("invoices");
  await getClient(clientId);

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("client_id", clientId)
        .eq("practice_id", session.practiceId)
        .order("due_date", { ascending: true });
      if (data) return data.map((r) => mapInvoiceRow(r as Record<string, unknown>));
    } catch {
      /* memory */
    }
  }

  return memoryStore.invoices
    .filter(
      (i) =>
        i.clientId === clientId && i.practiceId === session.practiceId,
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export async function createClientInvoice(input: z.infer<typeof createSchema>) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = createSchema.parse(input);
  await getClient(data.clientId);

  const lines = data.lines.map((line) => {
    const unit = Number(poundsToPence(line.unitPricePounds));
    const lineNet = Math.round(unit * line.quantity);
    const lineVat = Number(vatOnNet(lineNet, line.vatRateBps));
    return {
      description: line.description,
      quantity: line.quantity,
      unitPricePence: unit,
      vatRateBps: line.vatRateBps,
      lineNetPence: lineNet,
      lineVatPence: lineVat,
    };
  });

  const subtotalPence = lines.reduce((s, l) => s + l.lineNetPence, 0);
  const vatPence = lines.reduce((s, l) => s + l.lineVatPence, 0);
  const now = new Date().toISOString();

  const invoice: MemoryInvoice = {
    id: crypto.randomUUID(),
    practiceId: session.practiceId,
    clientId: data.clientId,
    invoiceNumber: nextInvoiceNumber(session.practiceId),
    status: data.status,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    currency: "gbp",
    subtotalPence,
    vatPence,
    totalPence: subtotalPence + vatPence,
    notes: data.notes?.trim() || null,
    reference: data.reference?.trim() || null,
    paymentInstructions: data.paymentInstructions?.trim() || null,
    lines,
    createdBy: session.userId,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.invoices.push(invoice);

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase.from("client_invoices").insert({
        id: invoice.id,
        practice_id: invoice.practiceId,
        client_id: invoice.clientId,
        invoice_number: invoice.invoiceNumber,
        status: invoice.status,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        currency: invoice.currency,
        subtotal_pence: invoice.subtotalPence,
        vat_pence: invoice.vatPence,
        total_pence: invoice.totalPence,
        notes: invoice.notes,
        reference: invoice.reference,
        payment_instructions: invoice.paymentInstructions,
        line_items: invoice.lines,
        created_by: session.userId,
      });
    } catch {
      /* memory ok */
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "invoice.created",
    entityType: "invoice",
    entityId: invoice.id,
    detail: {
      invoiceNumber: invoice.invoiceNumber,
      totalPence: invoice.totalPence,
      status: invoice.status,
    },
  });

  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/invoices`);
  return invoice;
}

export async function setInvoiceStatus(
  invoiceId: string,
  status: MemoryInvoice["status"],
) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");

  let invoice = memoryStore.invoices.find((i) => i.id === invoiceId);

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("client_invoices")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", invoiceId)
        .eq("practice_id", session.practiceId)
        .select("*")
        .maybeSingle();
      if (data) {
        invoice = mapInvoiceRow(data as Record<string, unknown>);
        const mem = memoryStore.invoices.find((i) => i.id === invoiceId);
        if (mem) {
          mem.status = status;
          mem.updatedAt = invoice.updatedAt;
        }
        revalidatePath(`/clients/${invoice.clientId}`);
        revalidatePath(`/clients/${invoice.clientId}/invoices`);
        return invoice;
      }
    } catch {
      /* memory */
    }
  }

  if (!invoice || invoice.practiceId !== session.practiceId) {
    throw new Error("Invoice not found");
  }
  invoice.status = status;
  invoice.updatedAt = new Date().toISOString();
  revalidatePath(`/clients/${invoice.clientId}`);
  revalidatePath(`/clients/${invoice.clientId}/invoices`);
  return invoice;
}

export async function getInvoice(invoiceId: string) {
  const session = await requireModule("invoices");

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("id", invoiceId)
        .eq("practice_id", session.practiceId)
        .maybeSingle();
      if (data) return mapInvoiceRow(data as Record<string, unknown>);
    } catch {
      /* memory */
    }
  }

  const invoice = memoryStore.invoices.find(
    (i) => i.id === invoiceId && i.practiceId === session.practiceId,
  );
  if (!invoice) throw new Error("Invoice not found");
  return invoice;
}

/** Email an invoice to the client — practice-scoped; never crosses accounts. */
export async function sendClientInvoiceEmail(input: {
  invoiceId: string;
  toEmail?: string;
  message?: string;
}) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");

  const invoice = await getInvoice(input.invoiceId);
  const client = await getClient(invoice.clientId);
  if (client.practiceId && client.practiceId !== session.practiceId) {
    throw new Error("Invoice not found");
  }

  const toEmail = (input.toEmail || client.contactEmail || "").trim();
  if (!toEmail) {
    throw new Error(
      "Add a client email address (or enter one) before sending this invoice.",
    );
  }

  const { getPracticeLetterhead } = await import(
    "@/server/actions/letterhead"
  );
  const letterhead = await getPracticeLetterhead();
  const { renderInvoiceHtml } = await import(
    "@/lib/invoices/render-invoice-html"
  );
  const html = renderInvoiceHtml({
    letterhead,
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      reference: invoice.reference,
      notes: invoice.notes,
      paymentInstructions: invoice.paymentInstructions,
      subtotalPence: invoice.subtotalPence,
      vatPence: invoice.vatPence,
      totalPence: invoice.totalPence,
      lines: invoice.lines,
    },
    client: {
      name: client.name,
      contactEmail: client.contactEmail,
      contactPhone: client.contactPhone,
      companyNumber: client.companyNumber,
    },
    brandingSettingsHref: "/settings/letterhead",
  });

  const total = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(invoice.totalPence / 100);

  const cover =
    input.message?.trim() ||
    [
      `Dear ${client.name},`,
      "",
      `Please find invoice ${invoice.invoiceNumber} for ${total}, due ${invoice.dueDate}.`,
      "",
      "If you have any questions, reply to this email.",
      "",
      `Kind regards,`,
      letterhead.practiceName || session.practiceName,
    ].join("\n");

  const { sendClientCommunicationEmail } = await import(
    "@/server/actions/client-communications"
  );
  const result = await sendClientCommunicationEmail({
    clientId: invoice.clientId,
    toEmail,
    subject: `Invoice ${invoice.invoiceNumber} — ${letterhead.practiceName || session.practiceName}`,
    message: cover,
    html: `${cover
      .split("\n")
      .map((l) => `<p>${l ? l.replace(/&/g, "&amp;").replace(/</g, "&lt;") : "&nbsp;"}</p>`)
      .join("")}<hr/>${html}`,
    kind: "invoice",
    documentCount: 1,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.html`,
        content: Buffer.from(html, "utf8").toString("base64"),
        contentType: "text/html; charset=utf-8",
      },
    ],
  });

  // Mark as sent when still draft/due so the desk reflects dispatch.
  if (invoice.status === "draft" || invoice.status === "due") {
    await setInvoiceStatus(invoice.id, "sent");
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: invoice.clientId,
    actorId: session.userId,
    action: "invoice.emailed",
    entityType: "client_invoice",
    entityId: invoice.id,
    detail: { toEmail, invoiceNumber: invoice.invoiceNumber },
  });

  revalidatePath(`/clients/${invoice.clientId}/invoices`);
  return {
    ok: true as const,
    toEmail,
    delivery:
      result && typeof result === "object" && "delivery" in result
        ? String((result as { delivery?: string }).delivery ?? "sent")
        : "sent",
  };
}

export async function listInvoiceLineTemplates() {
  const session = await requireModule("invoices");

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("invoice_line_templates")
        .select("*")
        .eq("practice_id", session.practiceId)
        .order("description", { ascending: true });
      if (data) {
        return data.map((r) => mapTemplateRow(r as Record<string, unknown>));
      }
    } catch {
      /* memory */
    }
  }

  return memoryStore.invoiceLineTemplates
    .filter((t) => t.practiceId === session.practiceId)
    .sort((a, b) => a.description.localeCompare(b.description));
}

export async function createInvoiceLineTemplate(
  input: z.infer<typeof templateSchema>,
) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = templateSchema.parse(input);
  const now = new Date().toISOString();

  const template: MemoryInvoiceLineTemplate = {
    id: crypto.randomUUID(),
    practiceId: session.practiceId,
    label: data.label?.trim() || null,
    description: data.description.trim(),
    quantity: data.quantity,
    unitPricePence: Number(poundsToPence(data.unitPricePounds)),
    vatRateBps: data.vatRateBps,
    createdBy: session.userId,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.invoiceLineTemplates.push(template);

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase.from("invoice_line_templates").insert({
        id: template.id,
        practice_id: template.practiceId,
        label: template.label,
        description: template.description,
        quantity: template.quantity,
        unit_price_pence: template.unitPricePence,
        vat_rate_bps: template.vatRateBps,
        created_by: session.userId,
      });
    } catch {
      /* memory ok */
    }
  }

  revalidatePath("/clients");
  return template;
}

export async function deleteInvoiceLineTemplate(templateId: string) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");

  memoryStore.invoiceLineTemplates = memoryStore.invoiceLineTemplates.filter(
    (t) => !(t.id === templateId && t.practiceId === session.practiceId),
  );

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("invoice_line_templates")
        .delete()
        .eq("id", templateId)
        .eq("practice_id", session.practiceId);
    } catch {
      /* memory ok */
    }
  }

  revalidatePath("/clients");
  return { ok: true as const };
}

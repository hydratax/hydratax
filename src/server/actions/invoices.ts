"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { escapeHtml } from "@/lib/html-escape";
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
import { computeInvoiceTotals } from "@/lib/invoices/compute-totals";

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
  notes: z.string().max(2000).optional(),
  reference: z.string().max(120).optional(),
  paymentInstructions: z.string().max(1000).optional(),
  status: z.enum(["draft", "sent", "due"]).default("due"),
  subject: z.string().max(300).optional(),
  orderNumber: z.string().max(120).optional(),
  paymentTerms: z.string().max(80).optional(),
  salesperson: z.string().max(120).optional(),
  arAccount: z.string().max(120).optional(),
  discountPounds: z.string().optional(),
  discountPercent: z.string().optional(),
  shippingPounds: z.string().optional(),
  adjustmentPounds: z.string().optional(),
  termsConditions: z.string().max(5000).optional(),
  enableOnlinePay: z.boolean().optional(),
  recurringEnabled: z.boolean().optional(),
  recurringInterval: z
    .enum(["weekly", "monthly", "quarterly", "yearly"])
    .optional()
    .nullable(),
  lines: z.array(lineSchema).min(1).max(50),
});

const templateSchema = z.object({
  label: z.string().max(80).optional(),
  description: z.string().min(1).max(300),
  quantity: z.coerce.number().positive().max(100000).default(1),
  unitPricePounds: z.string().min(1),
  vatRateBps: z.union([z.literal(0), z.literal(500), z.literal(2000)]),
});

async function nextInvoiceNumber(practiceId: string): Promise<string> {
  memoryStore.invoiceNumberPrefix ??= {};
  memoryStore.invoiceNumberNext ??= {};
  const prefix = memoryStore.invoiceNumberPrefix[practiceId] ?? "INV";

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practices")
        .select("invoice_number_prefix, invoice_number_next")
        .eq("id", practiceId)
        .maybeSingle();
      if (data) {
        const p = String(data.invoice_number_prefix ?? "INV");
        const n = Number(data.invoice_number_next ?? 1);
        await supabase
          .from("practices")
          .update({ invoice_number_next: n + 1 })
          .eq("id", practiceId);
        return `${p}-${String(n).padStart(4, "0")}`;
      }
    } catch {
      /* memory */
    }
  }

  const n = memoryStore.invoiceNumberNext[practiceId] ?? 1;
  memoryStore.invoiceNumberNext[practiceId] = n + 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
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
    subject: (r.subject as string | null) ?? null,
    orderNumber: (r.order_number as string | null) ?? null,
    paymentTerms: (r.payment_terms as string | null) ?? null,
    salesperson: (r.salesperson as string | null) ?? null,
    arAccount: (r.ar_account as string | null) ?? null,
    discountPence: Number(r.discount_pence ?? 0),
    discountPercentBps:
      r.discount_percent_bps == null
        ? null
        : Number(r.discount_percent_bps),
    shippingPence: Number(r.shipping_pence ?? 0),
    adjustmentPence: Number(r.adjustment_pence ?? 0),
    termsConditions: (r.terms_conditions as string | null) ?? null,
    enableOnlinePay: Boolean(r.enable_online_pay),
    recurringEnabled: Boolean(r.recurring_enabled),
    recurringInterval: (r.recurring_interval as MemoryInvoice["recurringInterval"]) ?? null,
    payToken: (r.pay_token as string | null) ?? null,
    stripeCheckoutSessionId:
      (r.stripe_checkout_session_id as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
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

/** Every invoice across the practice (dashboard / multi-client desk). */
export async function listPracticeInvoices() {
  const session = await requireModule("invoices");

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("practice_id", session.practiceId)
        .order("due_date", { ascending: true });
      if (data) return data.map((r) => mapInvoiceRow(r as Record<string, unknown>));
    } catch {
      /* memory */
    }
  }

  return memoryStore.invoices
    .filter((i) => i.practiceId === session.practiceId)
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

  const lineNet = lines.reduce((s, l) => s + l.lineNetPence, 0);
  const lineVat = lines.reduce((s, l) => s + l.lineVatPence, 0);
  const discountPercentBps = data.discountPercent
    ? Math.round(Number.parseFloat(data.discountPercent) * 100)
    : null;
  const discountPenceInput = data.discountPounds
    ? Number(poundsToPence(data.discountPounds))
    : 0;
  const totals = computeInvoiceTotals({
    lineNetPence: lineNet,
    lineVatPence: lineVat,
    discountPence: discountPenceInput,
    discountPercentBps:
      discountPenceInput > 0 ? null : discountPercentBps,
    shippingPence: data.shippingPounds
      ? Number(poundsToPence(data.shippingPounds))
      : 0,
    adjustmentPence: data.adjustmentPounds
      ? Number(poundsToPence(data.adjustmentPounds))
      : 0,
  });
  const now = new Date().toISOString();
  const payToken = crypto.randomUUID();

  const invoice: MemoryInvoice = {
    id: crypto.randomUUID(),
    practiceId: session.practiceId,
    clientId: data.clientId,
    invoiceNumber: await nextInvoiceNumber(session.practiceId),
    status: data.status,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    currency: "gbp",
    subtotalPence: totals.subtotalPence,
    vatPence: totals.vatPence,
    totalPence: totals.totalPence,
    notes: data.notes?.trim() || null,
    reference: data.reference?.trim() || null,
    paymentInstructions: data.paymentInstructions?.trim() || null,
    subject: data.subject?.trim() || null,
    orderNumber: data.orderNumber?.trim() || null,
    paymentTerms: data.paymentTerms?.trim() || null,
    salesperson: data.salesperson?.trim() || null,
    arAccount: data.arAccount?.trim() || "Accounts Receivable",
    discountPence: totals.discountPence,
    discountPercentBps:
      discountPenceInput > 0 ? null : discountPercentBps,
    shippingPence: totals.shippingPence,
    adjustmentPence: totals.adjustmentPence,
    termsConditions: data.termsConditions?.trim() || null,
    enableOnlinePay: Boolean(data.enableOnlinePay),
    recurringEnabled: Boolean(data.recurringEnabled),
    recurringInterval: data.recurringEnabled
      ? (data.recurringInterval ?? "monthly")
      : null,
    payToken,
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
        subject: invoice.subject,
        order_number: invoice.orderNumber,
        payment_terms: invoice.paymentTerms,
        salesperson: invoice.salesperson,
        ar_account: invoice.arAccount,
        discount_pence: invoice.discountPence,
        discount_percent_bps: invoice.discountPercentBps,
        shipping_pence: invoice.shippingPence,
        adjustment_pence: invoice.adjustmentPence,
        terms_conditions: invoice.termsConditions,
        enable_online_pay: invoice.enableOnlinePay,
        recurring_enabled: invoice.recurringEnabled,
        recurring_interval: invoice.recurringInterval,
        pay_token: invoice.payToken,
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

  // Remember product/service lines for next-time suggestions (practice-scoped).
  await rememberInvoiceLineItems({
    practiceId: session.practiceId,
    userId: session.userId,
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
      vatRateBps: l.vatRateBps as 0 | 500 | 2000,
    })),
  });

  // Same record shows on the client card and the practice Invoices desk.
  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/invoices`);
  revalidatePath("/invoices");
  revalidatePath("/clients", "layout");
  return invoice;
}

/** Upsert line descriptions so they appear in Item details suggestions. */
async function rememberInvoiceLineItems(opts: {
  practiceId: string;
  userId: string;
  lines: Array<{
    description: string;
    quantity: number;
    unitPricePence: number;
    vatRateBps: 0 | 500 | 2000;
  }>;
}) {
  const now = new Date().toISOString();
  const seen = new Set<string>();

  for (const line of opts.lines) {
    const description = line.description.trim();
    if (!description) continue;
    const key = description.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = memoryStore.invoiceLineTemplates.find(
      (t) =>
        t.practiceId === opts.practiceId &&
        t.description.trim().toLowerCase() === key,
    );

    if (existing) {
      existing.quantity = line.quantity;
      existing.unitPricePence = line.unitPricePence;
      existing.vatRateBps = line.vatRateBps;
      existing.updatedAt = now;
      if (isSupabaseConfigured()) {
        try {
          const { createClient } = await import("@/lib/supabase/server");
          const supabase = await createClient();
          await supabase
            .from("invoice_line_templates")
            .update({
              quantity: existing.quantity,
              unit_price_pence: existing.unitPricePence,
              vat_rate_bps: existing.vatRateBps,
              updated_at: now,
            })
            .eq("id", existing.id)
            .eq("practice_id", opts.practiceId);
        } catch {
          /* memory ok */
        }
      }
      continue;
    }

    const template: MemoryInvoiceLineTemplate = {
      id: crypto.randomUUID(),
      practiceId: opts.practiceId,
      label: null,
      description,
      quantity: line.quantity,
      unitPricePence: line.unitPricePence,
      vatRateBps: line.vatRateBps,
      createdBy: opts.userId,
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
          created_by: opts.userId,
        });
      } catch {
        /* memory ok */
      }
    }
  }
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
        revalidatePath("/invoices");
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
  revalidatePath("/invoices");
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
}): Promise<
  | { ok: true; toEmail: string; delivery: string }
  | { ok: false; error: string }
> {
  const session = await requireModule("invoices");
  if (session.role === "readonly") {
    return { ok: false, error: "You do not have permission to email invoices." };
  }

  let invoice;
  let client;
  try {
    invoice = await getInvoice(input.invoiceId);
    client = await getClient(invoice.clientId);
  } catch {
    return { ok: false, error: "That invoice could not be found." };
  }
  if (client.practiceId && client.practiceId !== session.practiceId) {
    return { ok: false, error: "That invoice could not be found." };
  }

  const toEmail = (input.toEmail || client.contactEmail || "").trim();
  if (!toEmail) {
    return {
      ok: false,
      error:
        "Enter the client’s email in the Send to box (or save an email on the client record), then try again.",
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return {
      ok: false,
      error: "That email address does not look valid. Check it and try again.",
    };
  }

  const { getPracticeLetterhead } = await import(
    "@/server/actions/letterhead"
  );
  const letterhead = await getPracticeLetterhead();
  const { renderInvoiceHtml } = await import(
    "@/lib/invoices/render-invoice-html"
  );
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://hydratax.uk"
  ).replace(/\/$/, "");
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
      subject: invoice.subject,
      termsConditions: invoice.termsConditions,
      discountPence: invoice.discountPence,
      shippingPence: invoice.shippingPence,
      adjustmentPence: invoice.adjustmentPence,
      payUrl:
        invoice.enableOnlinePay && invoice.payToken
          ? `${appUrl}/pay/${invoice.payToken}`
          : null,
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

  try {
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
        .map((l) => `<p>${l ? escapeHtml(l) : "&nbsp;"}</p>`)
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
  } catch (err) {
    const { messageFromUnknown } = await import("@/lib/action-error");
    return {
      ok: false,
      error: messageFromUnknown(
        err,
        "We could not email this invoice. Check the address and try again.",
      ),
    };
  }
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

/** Public pay-link lookup — no session; only non-sensitive fields. */
export async function getInvoiceByPayToken(
  payToken: string,
): Promise<MemoryInvoice | null> {
  const token = payToken.trim();
  if (!token) return null;

  if (isSupabaseConfigured()) {
    try {
      const { getBillingWriteClient } = await import(
        "@/server/billing/admin-client"
      );
      const supabase = await getBillingWriteClient();
      if (supabase) {
        const { data } = await supabase
          .from("client_invoices")
          .select("*")
          .eq("pay_token", token)
          .maybeSingle();
        if (data) return mapInvoiceRow(data as Record<string, unknown>);
      }
    } catch {
      /* memory */
    }
  }

  return (
    memoryStore.invoices.find((i) => i.payToken === token) ?? null
  );
}

export async function markClientInvoicePaidFromStripe(input: {
  invoiceId: string;
  practiceId: string;
  stripeCheckoutSessionId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const mem = memoryStore.invoices.find(
    (i) =>
      i.id === input.invoiceId && i.practiceId === input.practiceId,
  );
  if (mem && mem.status !== "paid" && mem.status !== "void") {
    mem.status = "paid";
    mem.paidAt = now;
    mem.stripeCheckoutSessionId = input.stripeCheckoutSessionId;
    mem.updatedAt = now;
  }

  if (isSupabaseConfigured()) {
    try {
      const { getBillingWriteClient } = await import(
        "@/server/billing/admin-client"
      );
      const supabase = await getBillingWriteClient();
      if (supabase) {
        await supabase
          .from("client_invoices")
          .update({
            status: "paid",
            paid_at: now,
            stripe_checkout_session_id: input.stripeCheckoutSessionId,
            updated_at: now,
          })
          .eq("id", input.invoiceId)
          .eq("practice_id", input.practiceId)
          .neq("status", "void");
      }
    } catch {
      /* memory */
    }
  }
}

export async function getInvoiceNumberSettings(): Promise<{
  prefix: string;
  next: number;
}> {
  const session = await requireModule("invoices");
  memoryStore.invoiceNumberPrefix ??= {};
  memoryStore.invoiceNumberNext ??= {};

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practices")
        .select("invoice_number_prefix, invoice_number_next")
        .eq("id", session.practiceId)
        .maybeSingle();
      if (data) {
        return {
          prefix: String(data.invoice_number_prefix ?? "INV"),
          next: Number(data.invoice_number_next ?? 1),
        };
      }
    } catch {
      /* memory */
    }
  }

  return {
    prefix: memoryStore.invoiceNumberPrefix[session.practiceId] ?? "INV",
    next: memoryStore.invoiceNumberNext[session.practiceId] ?? 1,
  };
}

export async function saveInvoiceNumberSettings(input: {
  prefix: string;
  next: number;
}) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");
  const prefix = input.prefix.trim().slice(0, 20) || "INV";
  const next = Math.max(1, Math.floor(input.next) || 1);

  memoryStore.invoiceNumberPrefix ??= {};
  memoryStore.invoiceNumberNext ??= {};
  memoryStore.invoiceNumberPrefix[session.practiceId] = prefix;
  memoryStore.invoiceNumberNext[session.practiceId] = next;

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("practices")
        .update({
          invoice_number_prefix: prefix,
          invoice_number_next: next,
        })
        .eq("id", session.practiceId);
    } catch {
      /* memory */
    }
  }

  revalidatePath("/settings/payments");
  return { prefix, next };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule, requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { memoryStore, type MemoryInvoice } from "@/server/demo/store";
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
  status: z.enum(["draft", "sent", "due"]).default("due"),
  lines: z.array(lineSchema).min(1).max(50),
});

function nextInvoiceNumber(practiceId: string) {
  const count =
    memoryStore.invoices.filter((i) => i.practiceId === practiceId).length + 1;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count).padStart(4, "0")}`;
}

export async function listClientInvoices(clientId: string) {
  await requireModule("invoices");
  await getClient(clientId);

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("client_invoices")
        .select("*")
        .eq("client_id", clientId)
        .order("due_date", { ascending: true });
      if (data) {
        return data.map((r) => ({
          id: r.id,
          practiceId: r.practice_id,
          clientId: r.client_id,
          invoiceNumber: r.invoice_number,
          status: r.status,
          issueDate: r.issue_date,
          dueDate: r.due_date,
          currency: r.currency,
          subtotalPence: r.subtotal_pence,
          vatPence: r.vat_pence,
          totalPence: r.total_pence,
          notes: r.notes,
          lines: (r.line_items as MemoryInvoice["lines"]) ?? [],
          createdBy: r.created_by ?? "",
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })) as MemoryInvoice[];
      }
    } catch {
      /* memory */
    }
  }

  return memoryStore.invoices
    .filter((i) => i.clientId === clientId)
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
  const invoice = memoryStore.invoices.find((i) => i.id === invoiceId);
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
  await requireSession();
  const invoice = memoryStore.invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  return invoice;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import {
  memoryStore,
  type MemoryTimeEntry,
} from "@/server/demo/store";
import { poundsToPence, penceToPounds } from "@/server/money/pence";
import { appendAuditEvent } from "@/server/audit/log";
import { isSupabaseConfigured } from "@/lib/env";
import { createClientInvoice } from "@/server/actions/invoices";

const entrySchema = z.object({
  clientId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(300),
  hours: z.coerce.number().positive().max(168),
  ratePounds: z.string().min(1),
  staffName: z.string().max(120).optional(),
});

function amountFromMinutes(minutes: number, ratePencePerHour: number) {
  return Math.round((minutes * ratePencePerHour) / 60);
}

function mapRow(r: Record<string, unknown>): MemoryTimeEntry {
  return {
    id: String(r.id),
    practiceId: String(r.practice_id),
    clientId: String(r.client_id),
    workDate: String(r.work_date),
    description: String(r.description),
    minutes: Number(r.minutes ?? 0),
    ratePencePerHour: Number(r.rate_pence_per_hour ?? 0),
    amountPence: Number(r.amount_pence ?? 0),
    staffName: (r.staff_name as string | null) ?? null,
    status: r.status as MemoryTimeEntry["status"],
    invoiceId: (r.invoice_id as string | null) ?? null,
    createdBy: String(r.created_by ?? ""),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function listClientTimeEntries(clientId: string) {
  await requireModule("invoices");
  await getClient(clientId);

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practice_time_entries")
        .select("*")
        .eq("client_id", clientId)
        .order("work_date", { ascending: false });
      if (data) return data.map((r) => mapRow(r as Record<string, unknown>));
    } catch {
      /* memory */
    }
  }

  return memoryStore.timeEntries
    .filter((e) => e.clientId === clientId)
    .sort((a, b) => b.workDate.localeCompare(a.workDate));
}

export async function createTimeEntry(input: z.infer<typeof entrySchema>) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");
  const data = entrySchema.parse(input);
  await getClient(data.clientId);

  const minutes = Math.round(data.hours * 60);
  if (minutes < 1) throw new Error("Enter time of at least one minute");
  const ratePencePerHour = Number(poundsToPence(data.ratePounds));
  const amountPence = amountFromMinutes(minutes, ratePencePerHour);
  const now = new Date().toISOString();

  const entry: MemoryTimeEntry = {
    id: crypto.randomUUID(),
    practiceId: session.practiceId,
    clientId: data.clientId,
    workDate: data.workDate,
    description: data.description.trim(),
    minutes,
    ratePencePerHour,
    amountPence,
    staffName: data.staffName?.trim() || null,
    status: "wip",
    invoiceId: null,
    createdBy: session.userId,
    createdAt: now,
    updatedAt: now,
  };

  memoryStore.timeEntries.push(entry);

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase.from("practice_time_entries").insert({
        id: entry.id,
        practice_id: entry.practiceId,
        client_id: entry.clientId,
        work_date: entry.workDate,
        description: entry.description,
        minutes: entry.minutes,
        rate_pence_per_hour: entry.ratePencePerHour,
        amount_pence: entry.amountPence,
        staff_name: entry.staffName,
        status: entry.status,
        invoice_id: entry.invoiceId,
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
    action: "time_entry.created",
    entityType: "time_entry",
    entityId: entry.id,
    detail: { minutes, amountPence, description: entry.description },
  });

  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath(`/clients/${data.clientId}/time-fees`);
  return entry;
}

export async function writeOffTimeEntries(input: {
  clientId: string;
  entryIds: string[];
}) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");
  await getClient(input.clientId);
  const ids = new Set(input.entryIds);
  if (ids.size === 0) throw new Error("Select time entries to write off");
  const now = new Date().toISOString();

  for (const entry of memoryStore.timeEntries) {
    if (
      entry.clientId === input.clientId &&
      ids.has(entry.id) &&
      entry.status === "wip"
    ) {
      entry.status = "written_off";
      entry.updatedAt = now;
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("practice_time_entries")
        .update({ status: "written_off", updated_at: now })
        .eq("client_id", input.clientId)
        .eq("status", "wip")
        .in("id", [...ids]);
    } catch {
      /* memory ok */
    }
  }

  revalidatePath(`/clients/${input.clientId}/time-fees`);
  return { ok: true as const };
}

/** Raise a client invoice from selected WIP and mark those entries billed. */
export async function billTimeEntries(input: {
  clientId: string;
  entryIds: string[];
  vatRateBps?: 0 | 500 | 2000;
  dueDate?: string;
}) {
  const session = await requireModule("invoices");
  if (session.role === "readonly") throw new Error("Forbidden");
  await getClient(input.clientId);

  const ids = new Set(input.entryIds);
  if (ids.size === 0) throw new Error("Select WIP to bill");

  let entries = memoryStore.timeEntries.filter(
    (e) =>
      e.clientId === input.clientId &&
      ids.has(e.id) &&
      e.status === "wip",
  );

  if (isSupabaseConfigured() && entries.length === 0) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase
        .from("practice_time_entries")
        .select("*")
        .eq("client_id", input.clientId)
        .eq("status", "wip")
        .in("id", [...ids]);
      if (data?.length) {
        entries = data.map((r) => mapRow(r as Record<string, unknown>));
        for (const e of entries) {
          if (!memoryStore.timeEntries.some((m) => m.id === e.id)) {
            memoryStore.timeEntries.push(e);
          }
        }
      }
    } catch {
      /* use memory */
    }
  }

  if (entries.length === 0) throw new Error("No open WIP matched your selection");

  const vatRateBps = input.vatRateBps ?? 2000;
  const today = new Date().toISOString().slice(0, 10);
  const due =
    input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
      ? input.dueDate
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 14);
          return d.toISOString().slice(0, 10);
        })();

  const lines = entries.map((e) => ({
    description: `${e.workDate} — ${e.description}${
      e.staffName ? ` (${e.staffName})` : ""
    }`,
    quantity: Number((e.minutes / 60).toFixed(2)),
    unitPricePounds: penceToPounds(e.ratePencePerHour),
    vatRateBps,
  }));

  const invoice = await createClientInvoice({
    clientId: input.clientId,
    issueDate: today,
    dueDate: due,
    status: "due",
    notes: "Raised from Time & fees WIP",
    lines,
  });

  const now = new Date().toISOString();
  const billedIds = entries.map((e) => e.id);
  for (const entry of memoryStore.timeEntries) {
    if (billedIds.includes(entry.id)) {
      entry.status = "billed";
      entry.invoiceId = invoice.id;
      entry.updatedAt = now;
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("practice_time_entries")
        .update({
          status: "billed",
          invoice_id: invoice.id,
          updated_at: now,
        })
        .in("id", billedIds);
    } catch {
      /* memory ok */
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "time_entry.billed",
    entityType: "time_entry",
    entityId: invoice.id,
    detail: { entryIds: billedIds, invoiceId: invoice.id },
  });

  revalidatePath(`/clients/${input.clientId}/time-fees`);
  revalidatePath(`/clients/${input.clientId}/invoices`);
  return invoice;
}

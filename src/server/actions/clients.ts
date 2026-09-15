"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import { demoStore, type DemoClient } from "@/server/demo/store";
import { appendAuditEvent } from "@/server/audit/log";
import {
  enrichLimitedCompanyFromCh,
  type ClientCompaniesHouseSnapshot,
} from "@/server/companies-house/enrich-client";
import type { PriorYearComparatives } from "@/lib/accounting-periods";

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["sole_trader", "limited_company", "partnership"]),
  companyNumber: z.string().optional(),
  utr: z.string().optional(),
  vrn: z.string().optional(),
  nino: z.string().optional(),
  companyAuthCode: z.string().optional(),
  payeRef: z.string().optional(),
  accountsOfficeRef: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional().or(z.literal("")),
  isEmployer: z.boolean().default(false),
  isVatRegistered: z.boolean().default(false),
  /** Skip CH lookup (bulk importer controls batching) */
  skipCompaniesHouse: z.boolean().optional(),
});

const updateClientSchema = createClientSchema
  .omit({ skipCompaniesHouse: true })
  .partial()
  .extend({
    clientId: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
  });

const MAX_BULK = 1000;

export type BulkImportRowResult = {
  row: number;
  name: string;
  ok: boolean;
  skipped?: boolean;
  updated?: boolean;
  error?: string;
  clientId?: string;
  companiesHouse?: boolean;
};

export type ClientRecord = {
  id: string;
  practiceId: string;
  name: string;
  type: "sole_trader" | "limited_company" | "partnership";
  companyNumber: string | null;
  utr: string | null;
  vrn: string | null;
  nino: string | null;
  companyAuthCode: string | null;
  payeRef: string | null;
  accountsOfficeRef: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isEmployer: boolean;
  isVatRegistered: boolean;
  companiesHouse: ClientCompaniesHouseSnapshot | null;
  accountsComparatives: PriorYearComparatives | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function mapSupabaseClient(row: Record<string, unknown>): ClientRecord {
  return {
    id: row.id as string,
    practiceId: row.practice_id as string,
    name: row.name as string,
    type: row.type as ClientRecord["type"],
    companyNumber: (row.company_number as string | null) ?? null,
    utr: (row.utr as string | null) ?? null,
    vrn: (row.vrn as string | null) ?? null,
    nino: (row.nino as string | null) ?? null,
    companyAuthCode: (row.company_auth_code as string | null) ?? null,
    payeRef: (row.paye_ref as string | null) ?? null,
    accountsOfficeRef: (row.accounts_office_ref as string | null) ?? null,
    contactEmail: (row.contact_email as string | null) ?? null,
    contactPhone: (row.contact_phone as string | null) ?? null,
    isEmployer: Boolean(row.is_employer),
    isVatRegistered: Boolean(row.is_vat_registered),
    companiesHouse:
      (row.companies_house as ClientCompaniesHouseSnapshot | null) ?? null,
    accountsComparatives: (row.accounts_comparatives as ClientRecord["accountsComparatives"]) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

async function resolveCompaniesHouse(
  type: string,
  companyNumber: string | undefined,
  skip?: boolean,
): Promise<ClientCompaniesHouseSnapshot | null> {
  if (skip || type !== "limited_company") return null;
  const num = companyNumber?.trim();
  if (!num) return null;
  try {
    return await enrichLimitedCompanyFromCh(num);
  } catch {
    return null;
  }
}

async function safeAudit(
  input: Parameters<typeof appendAuditEvent>[0],
): Promise<void> {
  try {
    await appendAuditEvent(input);
  } catch (err) {
    console.warn("[audit] append failed", err);
  }
}

export type ClientIdName = { id: string; name: string };

export async function listClientIdNames(): Promise<ClientIdName[]> {
  const session = await requireSession();
  if (isDemoMode()) {
    return demoStore.clients
      .filter(
        (c) =>
          c.practiceId === session.practiceId ||
          c.practiceId === demoStore.practice.id,
      )
      .map((c) => ({ id: c.id, name: c.name }));
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient: createSupabase } = await import(
        "@/lib/supabase/server"
      );
      const supabase = await createSupabase();
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("practice_id", session.practiceId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("[clients] supabase id list failed", error.message);
      } else if (data) {
        return data.map((row) => ({
          id: row.id as string,
          name: row.name as string,
        }));
      }
    } catch (err) {
      console.warn("[clients] supabase id list error", err);
    }
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return [];

  try {
    const { clients } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await getDb()
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.practiceId, session.practiceId));
    return rows;
  } catch {
    return [];
  }
}

export async function fetchClientRecord(
  clientId: string,
): Promise<ClientRecord | null> {
  const session = await requireSession();
  if (isDemoMode()) {
    const found = demoStore.clients.find(
      (c) =>
        c.id === clientId &&
        (c.practiceId === session.practiceId ||
          c.practiceId === demoStore.practice.id),
    );
    return (found as ClientRecord) ?? null;
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient: createSupabase } = await import(
        "@/lib/supabase/server"
      );
      const supabase = await createSupabase();
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .eq("practice_id", session.practiceId)
        .maybeSingle();
      if (error) {
        console.warn("[clients] supabase fetch failed", error.message);
      } else if (data) {
        return mapSupabaseClient(data);
      }
    } catch (err) {
      console.warn("[clients] supabase fetch error", err);
    }
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return null;

  try {
    const { clients } = await import("@/server/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await getDb()
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.id, clientId),
          eq(clients.practiceId, session.practiceId),
        ),
      )
      .limit(1);
    return (row as ClientRecord) ?? null;
  } catch {
    return null;
  }
}

export async function listClients() {
  const session = await requireSession();
  if (isDemoMode()) {
    return demoStore.clients.filter(
      (c) =>
        c.practiceId === session.practiceId ||
        c.practiceId === demoStore.practice.id,
    );
  }

  if (isSupabaseConfigured()) {
    try {
      const { createClient: createSupabase } = await import(
        "@/lib/supabase/server"
      );
      const supabase = await createSupabase();
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("practice_id", session.practiceId)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("[clients] supabase list failed", error.message);
      } else if (data) {
        return data.map((row) => mapSupabaseClient(row));
      }
    } catch (err) {
      console.warn("[clients] supabase list error", err);
    }
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) return [];

  try {
    const { clients } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    return getDb()
      .select()
      .from(clients)
      .where(eq(clients.practiceId, session.practiceId));
  } catch {
    return [];
  }
}

export async function getClient(ref: string) {
  const { resolveClientFromRef } = await import(
    "@/server/clients/resolve-client-page"
  );
  const { client } = await resolveClientFromRef(ref);
  return client;
}

export async function createClient(input: z.infer<typeof createClientSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const { hasDatabase } = await import("@/server/db");
  if (
    process.env.NODE_ENV === "production" &&
    !hasDatabase() &&
    !isSupabaseConfigured()
  ) {
    throw new Error(
      "Client storage is not configured. Add DATABASE_URL or Supabase env vars in Netlify.",
    );
  }

  const data = createClientSchema.parse(input);
  const now = new Date().toISOString();

  const ch = await resolveCompaniesHouse(
    data.type,
    data.companyNumber,
    data.skipCompaniesHouse,
  );

  const name =
    data.type === "limited_company" && ch?.companyName
      ? ch.companyName
      : data.name;
  const companyNumber =
    data.type === "limited_company"
      ? (ch?.companyNumber ?? data.companyNumber?.trim().toUpperCase() ?? null)
      : (data.companyNumber ?? null);

  if (isDemoMode()) {
    const client: DemoClient = {
      id: crypto.randomUUID(),
      practiceId: session.practiceId,
      name,
      type: data.type,
      companyNumber,
      utr: data.utr ?? null,
      vrn: data.vrn ?? null,
      nino: data.nino ?? null,
      companyAuthCode: normalizeCompanyAuthCode(data.companyAuthCode),
      payeRef: data.payeRef ?? null,
      accountsOfficeRef: data.accountsOfficeRef ?? null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone?.trim() || null,
      isEmployer: data.isEmployer,
      isVatRegistered: data.isVatRegistered,
      companiesHouse: ch,
      accountsComparatives: null,
      createdAt: now,
      updatedAt: now,
    };
    demoStore.clients.push(client);
    demoStore.hmrcConnections.push({
      clientId: client.id,
      connected: false,
      hmrcEnv: process.env.HMRC_ENV === "production" ? "production" : "test",
      scopes: "",
    });
    await safeAudit({
      practiceId: session.practiceId,
      clientId: client.id,
      actorId: session.userId,
      action: "client.create",
      entityType: "client",
      entityId: client.id,
      detail: {
        name: client.name,
        type: client.type,
        companiesHouse: Boolean(ch),
      },
    });
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return client;
  }

  if (isSupabaseConfigured()) {
    const { createClient: createSupabase } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createSupabase();
    const { data: row, error } = await supabase
      .from("clients")
      .insert({
        practice_id: session.practiceId,
        name,
        type: data.type,
        company_number: companyNumber,
        utr: data.utr ?? null,
        vrn: data.vrn ?? null,
        nino: data.nino ?? null,
        company_auth_code: normalizeCompanyAuthCode(data.companyAuthCode),
        paye_ref: data.payeRef ?? null,
        accounts_office_ref: data.accountsOfficeRef ?? null,
        contact_email: data.contactEmail || null,
        contact_phone: data.contactPhone?.trim() || null,
        is_employer: data.isEmployer,
        is_vat_registered: data.isVatRegistered,
        companies_house: ch,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const created = mapSupabaseClient(row);
    await safeAudit({
      practiceId: session.practiceId,
      clientId: created.id,
      actorId: session.userId,
      action: "client.create",
      entityType: "client",
      entityId: created.id,
      detail: {
        name: created.name,
        type: created.type,
        companiesHouse: Boolean(ch),
      },
    });
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return created;
  }

  const { getDb } = await import("@/server/db");
  const { clients } = await import("@/server/db/schema");
  const [created] = await getDb()
    .insert(clients)
    .values({
      practiceId: session.practiceId,
      name,
      type: data.type,
      companyNumber,
      utr: data.utr ?? null,
      vrn: data.vrn ?? null,
      nino: data.nino ?? null,
      companyAuthCode: normalizeCompanyAuthCode(data.companyAuthCode),
      payeRef: data.payeRef ?? null,
      accountsOfficeRef: data.accountsOfficeRef ?? null,
      contactEmail: data.contactEmail || null,
      contactPhone: data.contactPhone?.trim() || null,
      isEmployer: data.isEmployer,
      isVatRegistered: data.isVatRegistered,
      companiesHouse: ch,
    })
    .returning();

  await safeAudit({
    practiceId: session.practiceId,
    clientId: created.id,
    actorId: session.userId,
    action: "client.create",
    entityType: "client",
    entityId: created.id,
    detail: {
      name: created.name,
      type: created.type,
      companiesHouse: Boolean(ch),
    },
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return created;
}

/** Amend client name, contact details, tax identifiers and flags. */
export async function updateClient(input: z.infer<typeof updateClientSchema>) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const data = updateClientSchema.parse(input);
  const existing = await getClient(data.clientId);
  if (!existing || existing.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }

  const patch = {
    name: data.name?.trim() || existing.name,
    companyNumber:
      data.companyNumber !== undefined
        ? data.companyNumber.trim().toUpperCase() || null
        : existing.companyNumber,
    utr: data.utr !== undefined ? data.utr.trim() || null : existing.utr,
    vrn: data.vrn !== undefined ? data.vrn.trim() || null : existing.vrn,
    nino: data.nino !== undefined ? data.nino.trim() || null : existing.nino,
    companyAuthCode:
      data.companyAuthCode !== undefined
        ? normalizeCompanyAuthCode(data.companyAuthCode)
        : existing.companyAuthCode,
    payeRef:
      data.payeRef !== undefined
        ? data.payeRef.trim() || null
        : existing.payeRef,
    accountsOfficeRef:
      data.accountsOfficeRef !== undefined
        ? data.accountsOfficeRef.trim() || null
        : existing.accountsOfficeRef,
    contactEmail:
      data.contactEmail !== undefined
        ? data.contactEmail.trim() || null
        : existing.contactEmail,
    contactPhone:
      data.contactPhone !== undefined
        ? data.contactPhone.trim() || null
        : existing.contactPhone,
    isEmployer:
      data.isEmployer !== undefined ? data.isEmployer : existing.isEmployer,
    isVatRegistered:
      data.isVatRegistered !== undefined
        ? data.isVatRegistered
        : existing.isVatRegistered,
    updatedAt: new Date().toISOString(),
  };

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === data.clientId);
    if (!row) throw new Error("Client not found");
    Object.assign(row, patch);
    await safeAudit({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "client.update",
      entityType: "client",
      entityId: data.clientId,
      detail: { name: patch.name },
    });
    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath("/clients");
    return row as ClientRecord;
  }

  if (isSupabaseConfigured()) {
    const { createClient: createSupabase } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createSupabase();
    const { data: row, error } = await supabase
      .from("clients")
      .update({
        name: patch.name,
        company_number: patch.companyNumber,
        utr: patch.utr,
        vrn: patch.vrn,
        nino: patch.nino,
        company_auth_code: patch.companyAuthCode,
        paye_ref: patch.payeRef,
        accounts_office_ref: patch.accountsOfficeRef,
        contact_email: patch.contactEmail,
        contact_phone: patch.contactPhone,
        is_employer: patch.isEmployer,
        is_vat_registered: patch.isVatRegistered,
        updated_at: patch.updatedAt,
      })
      .eq("id", data.clientId)
      .eq("practice_id", session.practiceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await safeAudit({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "client.update",
      entityType: "client",
      entityId: data.clientId,
      detail: { name: patch.name },
    });
    revalidatePath(`/clients/${data.clientId}`);
    revalidatePath("/clients");
    return mapSupabaseClient(row);
  }

  const { getDb } = await import("@/server/db");
  const { clients } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const [updated] = await getDb()
    .update(clients)
    .set({
      name: patch.name,
      companyNumber: patch.companyNumber,
      utr: patch.utr,
      vrn: patch.vrn,
      nino: patch.nino,
      companyAuthCode: patch.companyAuthCode,
      payeRef: patch.payeRef,
      accountsOfficeRef: patch.accountsOfficeRef,
      contactEmail: patch.contactEmail,
      contactPhone: patch.contactPhone,
      isEmployer: patch.isEmployer,
      isVatRegistered: patch.isVatRegistered,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clients.id, data.clientId),
        eq(clients.practiceId, session.practiceId),
      ),
    )
    .returning();
  if (!updated) throw new Error("Client not found");

  await safeAudit({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "client.update",
    entityType: "client",
    entityId: data.clientId,
    detail: { name: patch.name },
  });
  revalidatePath(`/clients/${data.clientId}`);
  revalidatePath("/clients");
  return updated as ClientRecord;
}

/** Refresh Companies House data for an existing limited company client */
export async function refreshClientCompaniesHouse(clientId: string) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const client = await getClient(clientId);
  if (client.type !== "limited_company") {
    throw new Error("Companies House lookup is only for limited companies");
  }
  if (!client.companyNumber) {
    throw new Error("Add a company number first");
  }

  const ch = await enrichLimitedCompanyFromCh(client.companyNumber);
  if (!ch) {
    throw new Error(
      "Companies House lookup failed — check COMPANIES_HOUSE_API_KEY and ENV=live",
    );
  }

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (!row) throw new Error("Client not found");
    row.companiesHouse = ch;
    row.name = ch.companyName || row.name;
    row.companyNumber = ch.companyNumber;
    row.updatedAt = new Date().toISOString();
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
    return row;
  }

  if (isSupabaseConfigured()) {
    const { createClient: createSupabase } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createSupabase();
    const { data, error } = await supabase
      .from("clients")
      .update({
        companies_house: ch,
        name: ch.companyName,
        company_number: ch.companyNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("practice_id", session.practiceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath("/clients");
    return mapSupabaseClient(data);
  }

  const { getDb } = await import("@/server/db");
  const { clients } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const [updated] = await getDb()
    .update(clients)
    .set({
      companiesHouse: ch,
      name: ch.companyName,
      companyNumber: ch.companyNumber,
      updatedAt: new Date(),
    })
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    )
    .returning();
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return updated;
}

const STALE_CH_MS = 6 * 60 * 60 * 1000; // 6 hours

function isChSnapshotStale(
  snap: ClientCompaniesHouseSnapshot | null | undefined,
): boolean {
  if (!snap?.fetchedAt) return true;
  const t = Date.parse(snap.fetchedAt);
  if (Number.isNaN(t)) return true;
  return Date.now() - t > STALE_CH_MS;
}

/**
 * Refresh Companies House snapshots for limited companies with missing/stale
 * data so the clients dashboard matches the public register.
 */
export async function refreshStaleClientsCompaniesHouse(opts?: {
  /** Refresh every limited company, not only stale ones */
  force?: boolean;
  /** Cap CH API calls per request (Netlify time limits) */
  limit?: number;
}): Promise<{ refreshed: number; skipped: number }> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const force = opts?.force ?? false;
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 40);
  const clients = await listClients();
  const targets = clients.filter(
    (c) =>
      c.type === "limited_company" &&
      Boolean(c.companyNumber) &&
      (force ||
        isChSnapshotStale(
          ("companiesHouse" in c
            ? (c.companiesHouse as ClientCompaniesHouseSnapshot | null)
            : null) ?? null,
        )),
  );

  let refreshed = 0;
  let skipped = targets.length;
  const batch = targets.slice(0, limit);

  for (const client of batch) {
    try {
      await refreshClientCompaniesHouse(client.id);
      refreshed += 1;
    } catch (err) {
      console.warn("[ch.refresh] client refresh failed", client.id, err);
    }
  }
  skipped = Math.max(0, targets.length - refreshed);
  revalidatePath("/clients");
  return { refreshed, skipped };
}

function purgeDemoClientData(clientId: string) {
  const notClient = <T extends { clientId: string }>(row: T) =>
    row.clientId !== clientId;
  demoStore.clients = demoStore.clients.filter((c) => c.id !== clientId);
  demoStore.hmrcConnections = demoStore.hmrcConnections.filter(
    (c) => c.clientId !== clientId,
  );
  demoStore.ledger = demoStore.ledger.filter(notClient);
  demoStore.vatReturns = demoStore.vatReturns.filter(
    (r) => String(r.clientId ?? "") !== clientId,
  );
  demoStore.saSubmissions = demoStore.saSubmissions.filter(
    (r) => String(r.clientId ?? "") !== clientId,
  );
  demoStore.ct600Returns = demoStore.ct600Returns.filter(
    (r) => String(r.clientId ?? "") !== clientId,
  );
  demoStore.employees = demoStore.employees.filter(notClient);
  demoStore.payRuns = demoStore.payRuns.filter(
    (r) => String(r.clientId ?? "") !== clientId,
  );
  demoStore.payrollTimesheets = demoStore.payrollTimesheets.filter(notClient);
  demoStore.documents = demoStore.documents.filter(notClient);
  demoStore.bankTransactions = demoStore.bankTransactions.filter(notClient);
  demoStore.emailLogs = demoStore.emailLogs.filter(notClient);
  demoStore.invoices = demoStore.invoices.filter(notClient);
  demoStore.csFilings = demoStore.csFilings.filter(
    (r) => r.clientId !== clientId,
  );
  demoStore.in01Filings = demoStore.in01Filings.filter(
    (r) => r.clientId !== clientId,
  );
  demoStore.trialBalances = demoStore.trialBalances.filter(
    (r) => r.clientId !== clientId,
  );
}

/** Permanently remove a client and all workspace data for the practice. */
export async function deleteClient(clientId: string) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const client = await getClient(clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }

  try {
    const { deskDeleteBankTransactionsForClient } = await import(
      "@/server/db/desk-store"
    );
    await deskDeleteBankTransactionsForClient(clientId);
  } catch (err) {
    console.warn("[clients] desk bank cleanup failed", err);
  }

  if (isDemoMode()) {
    purgeDemoClientData(clientId);
    await safeAudit({
      practiceId: session.practiceId,
      clientId,
      actorId: session.userId,
      action: "client.delete",
      entityType: "client",
      entityId: clientId,
      detail: { name: client.name },
    });
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { ok: true as const };
  }

  if (isSupabaseConfigured()) {
    const { createClient: createSupabase } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createSupabase();

    const { error: invoicesError } = await supabase
      .from("client_invoices")
      .delete()
      .eq("client_id", clientId);
    if (invoicesError) {
      console.warn("[clients] invoice cleanup failed", invoicesError.message);
    }

    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("practice_id", session.practiceId);

    if (error) {
      throw new Error(error.message);
    }

    await safeAudit({
      practiceId: session.practiceId,
      clientId,
      actorId: session.userId,
      action: "client.delete",
      entityType: "client",
      entityId: clientId,
      detail: { name: client.name },
    });
    revalidatePath("/clients");
    revalidatePath("/dashboard");
    return { ok: true as const };
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) throw new Error("Client storage is not configured");

  const { eq, and } = await import("drizzle-orm");
  const {
    clients,
    hmrcConnections,
    ledgerEntries,
    vatReturns,
    saSubmissions,
    ct600Returns,
    employees,
    payRuns,
    payrollTimesheets,
    clientDocuments,
    bankTransactions,
  } = await import("@/server/db/schema");

  const db = getDb();
  await db.delete(hmrcConnections).where(eq(hmrcConnections.clientId, clientId));
  await db.delete(bankTransactions).where(eq(bankTransactions.clientId, clientId));
  await db.delete(clientDocuments).where(eq(clientDocuments.clientId, clientId));
  await db.delete(payrollTimesheets).where(eq(payrollTimesheets.clientId, clientId));
  await db.delete(payRuns).where(eq(payRuns.clientId, clientId));
  await db.delete(employees).where(eq(employees.clientId, clientId));
  await db.delete(vatReturns).where(eq(vatReturns.clientId, clientId));
  await db.delete(saSubmissions).where(eq(saSubmissions.clientId, clientId));
  await db.delete(ct600Returns).where(eq(ct600Returns.clientId, clientId));
  await db.delete(ledgerEntries).where(eq(ledgerEntries.clientId, clientId));

  const [removed] = await db
    .delete(clients)
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    )
    .returning({ id: clients.id });

  if (!removed) throw new Error("Client not found");

  await safeAudit({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "client.delete",
    entityType: "client",
    entityId: clientId,
    detail: { name: client.name },
  });
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y"].includes(s);
}

function normalizeType(
  raw: unknown,
): "sole_trader" | "limited_company" | "partnership" {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    s === "limited_company" ||
    s === "ltd" ||
    s === "limited" ||
    s === "company"
  ) {
    return "limited_company";
  }
  if (s === "partnership" || s === "partner") return "partnership";
  return "sole_trader";
}

function cell(
  row: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  const map = new Map(
    Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v]),
  );
  for (const key of keys) {
    const v = map.get(key.toLowerCase());
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function normalizeClientName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeCompanyAuthCode(raw?: string): string | null {
  const v = raw?.trim().toUpperCase();
  return v || null;
}

function importIdentifierPatch(raw: Record<string, unknown>) {
  const authCode = normalizeCompanyAuthCode(
    cell(
      raw,
      "company_auth_code",
      "authentication_code",
      "auth_code",
      "company authentication code",
      "company auth code",
      "authentication code",
    ),
  );
  const utr = cell(raw, "utr");
  const vrn = cell(raw, "vrn", "vat", "vat_number");
  const payeRef = cell(raw, "paye_ref", "paye", "paye ref");
  const accountsOfficeRef = cell(
    raw,
    "accounts_office_ref",
    "accounts_office",
    "ao_ref",
  );
  const contactEmail = cell(raw, "contact_email", "email", "client_email");

  const patch: Record<string, string | null> = {};
  if (authCode) patch.companyAuthCode = authCode;
  if (utr) patch.utr = utr;
  if (vrn) patch.vrn = vrn;
  if (payeRef) patch.payeRef = payeRef;
  if (accountsOfficeRef) patch.accountsOfficeRef = accountsOfficeRef;
  if (contactEmail) patch.contactEmail = contactEmail;
  return patch;
}

async function applyClientImportPatch(
  clientId: string,
  practiceId: string,
  patch: Record<string, string | null>,
) {
  const updatedAt = new Date().toISOString();
  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (!row) throw new Error("Client not found");
    if (patch.companyAuthCode !== undefined) {
      row.companyAuthCode = patch.companyAuthCode;
    }
    if (patch.utr !== undefined) row.utr = patch.utr;
    if (patch.vrn !== undefined) row.vrn = patch.vrn;
    if (patch.payeRef !== undefined) row.payeRef = patch.payeRef;
    if (patch.accountsOfficeRef !== undefined) {
      row.accountsOfficeRef = patch.accountsOfficeRef;
    }
    if (patch.contactEmail !== undefined) row.contactEmail = patch.contactEmail;
    row.updatedAt = updatedAt;
    return row as ClientRecord;
  }

  if (isSupabaseConfigured()) {
    const { createClient: createSupabase } = await import(
      "@/lib/supabase/server"
    );
    const supabase = await createSupabase();
    const { data: row, error } = await supabase
      .from("clients")
      .update({
        ...(patch.companyAuthCode !== undefined
          ? { company_auth_code: patch.companyAuthCode }
          : {}),
        ...(patch.utr !== undefined ? { utr: patch.utr } : {}),
        ...(patch.vrn !== undefined ? { vrn: patch.vrn } : {}),
        ...(patch.payeRef !== undefined ? { paye_ref: patch.payeRef } : {}),
        ...(patch.accountsOfficeRef !== undefined
          ? { accounts_office_ref: patch.accountsOfficeRef }
          : {}),
        ...(patch.contactEmail !== undefined
          ? { contact_email: patch.contactEmail }
          : {}),
        updated_at: updatedAt,
      })
      .eq("id", clientId)
      .eq("practice_id", practiceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapSupabaseClient(row);
  }

  const { getDb } = await import("@/server/db");
  const { clients } = await import("@/server/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const [row] = await getDb()
    .update(clients)
    .set({
      ...(patch.companyAuthCode !== undefined
        ? { companyAuthCode: patch.companyAuthCode }
        : {}),
      ...(patch.utr !== undefined ? { utr: patch.utr } : {}),
      ...(patch.vrn !== undefined ? { vrn: patch.vrn } : {}),
      ...(patch.payeRef !== undefined ? { payeRef: patch.payeRef } : {}),
      ...(patch.accountsOfficeRef !== undefined
        ? { accountsOfficeRef: patch.accountsOfficeRef }
        : {}),
      ...(patch.contactEmail !== undefined
        ? { contactEmail: patch.contactEmail }
        : {}),
      updatedAt: new Date(updatedAt),
    })
    .where(and(eq(clients.id, clientId), eq(clients.practiceId, practiceId)))
    .returning();
  if (!row) throw new Error("Client not found");
  return row as ClientRecord;
}

function normalizeCompanyNumber(raw: string): string {
  const compact = raw.replace(/\s/g, "").toUpperCase();
  if (/^\d+$/.test(compact)) return compact.padStart(8, "0");
  return compact;
}

function buildExistingClientIndex(
  clients: Array<{ id: string; name: string; companyNumber?: string | null }>,
) {
  const byCompanyNumber = new Map<
    string,
    { id: string; name: string; companyNumber?: string | null }
  >();
  const byName = new Map<
    string,
    { id: string; name: string; companyNumber?: string | null }
  >();
  for (const c of clients) {
    if (c.companyNumber) {
      byCompanyNumber.set(normalizeCompanyNumber(c.companyNumber), c);
    }
    byName.set(normalizeClientName(c.name), c);
  }
  return { byCompanyNumber, byName };
}

function findExistingClient(
  index: ReturnType<typeof buildExistingClientIndex>,
  name: string,
  companyNumber?: string,
): { id: string; name: string; companyNumber?: string | null } | undefined {
  if (companyNumber) {
    const hit = index.byCompanyNumber.get(normalizeCompanyNumber(companyNumber));
    if (hit) return hit;
  }
  const normalized = normalizeClientName(name);
  if (normalized) return index.byName.get(normalized);
  return undefined;
}

/**
 * Import up to 1000 clients from parsed Excel/CSV rows.
 * Limited companies with a company number are enriched via Companies House
 * (batched to respect API rate limits).
 */
export async function bulkImportClients(
  rows: Array<Record<string, unknown>>,
): Promise<{
  created: number;
  skipped: number;
  updated: number;
  failed: number;
  results: BulkImportRowResult[];
}> {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No rows to import");
  }
  if (rows.length > MAX_BULK) {
    throw new Error(`Maximum ${MAX_BULK} clients per upload`);
  }

  const existing = await listClients();
  const index = buildExistingClientIndex(existing);
  const seenCompanyNumbers = new Set<string>();
  const seenNames = new Set<string>();

  const results: BulkImportRowResult[] = [];
  const CHUNK = 5;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const chunkResults = await Promise.all(
      slice.map(async (raw, offset) => {
        const rowNum = i + offset + 2;
        const companyNumber = cell(
          raw,
          "company_number",
          "company number",
          "companynumber",
          "co_number",
        );
        let type = normalizeType(
          cell(raw, "type", "client_type", "entity_type"),
        );
        if (!cell(raw, "type", "client_type", "entity_type") && companyNumber) {
          type = "limited_company";
        }

        const name =
          cell(raw, "name", "client_name", "client name", "company_name") ??
          "";
        const displayName = name || companyNumber || "(blank)";

        try {
          if (!name && !(type === "limited_company" && companyNumber)) {
            throw new Error("Missing name");
          }

          const normalizedName = normalizeClientName(
            name || companyNumber || "Unnamed client",
          );
          const normalizedCo = companyNumber
            ? normalizeCompanyNumber(companyNumber)
            : null;

          if (normalizedCo && seenCompanyNumbers.has(normalizedCo)) {
            return {
              row: rowNum,
              name: displayName,
              ok: true,
              skipped: true,
              error: "Duplicate row in file (same company number)",
            };
          }
          if (seenNames.has(normalizedName)) {
            return {
              row: rowNum,
              name: displayName,
              ok: true,
              skipped: true,
              error: "Duplicate row in file (same name)",
            };
          }

          const existingClient = findExistingClient(
            index,
            name || companyNumber || "Unnamed client",
            companyNumber,
          );
          if (existingClient) {
            const idPatch = importIdentifierPatch(raw);
            if (Object.keys(idPatch).length > 0) {
              await applyClientImportPatch(
                existingClient.id,
                session.practiceId,
                idPatch,
              );
              return {
                row: rowNum,
                name: displayName,
                ok: true,
                skipped: true,
                updated: true,
                clientId: existingClient.id,
                error: "Updated identifiers on existing client",
              };
            }
            return {
              row: rowNum,
              name: displayName,
              ok: true,
              skipped: true,
              clientId: existingClient.id,
              error: "Already in your practice",
            };
          }

          const client = await createClient({
            name: name || companyNumber || "Unnamed client",
            type,
            companyNumber,
            utr: cell(raw, "utr"),
            vrn: cell(raw, "vrn", "vat", "vat_number"),
            nino: cell(raw, "nino", "ni"),
            companyAuthCode: cell(
              raw,
              "company_auth_code",
              "authentication_code",
              "auth_code",
              "company authentication code",
              "company auth code",
              "authentication code",
            ),
            payeRef: cell(raw, "paye_ref", "paye", "paye ref"),
            accountsOfficeRef: cell(
              raw,
              "accounts_office_ref",
              "accounts_office",
              "ao_ref",
            ),
            contactEmail: cell(raw, "contact_email", "email", "client_email"),
            isEmployer: parseBool(
              cell(raw, "is_employer", "employer", "paye_employer"),
            ),
            isVatRegistered: parseBool(
              cell(raw, "is_vat_registered", "vat_registered", "is_vat"),
            ),
            skipCompaniesHouse: false,
          });

          if (normalizedCo) seenCompanyNumbers.add(normalizedCo);
          seenNames.add(normalizedName);
          if (client.companyNumber) {
            index.byCompanyNumber.set(
              normalizeCompanyNumber(client.companyNumber),
              { id: client.id, name: client.name, companyNumber: client.companyNumber },
            );
          }
          index.byName.set(normalizeClientName(client.name), {
            id: client.id,
            name: client.name,
            companyNumber: client.companyNumber ?? null,
          });

          return {
            row: rowNum,
            name: client.name,
            ok: true,
            clientId: client.id,
            companiesHouse: Boolean(
              "companiesHouse" in client && client.companiesHouse,
            ),
          };
        } catch (err) {
          return {
            row: rowNum,
            name: displayName,
            ok: false as const,
            error: err instanceof Error ? err.message : "Failed",
          };
        }
      }),
    );
    results.push(...chunkResults);
  }

  results.sort((a, b) => a.row - b.row);
  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return {
    created: results.filter((r) => r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.ok && r.skipped && !r.updated).length,
    updated: results.filter((r) => r.ok && r.updated).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

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

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(["sole_trader", "limited_company", "partnership"]),
  companyNumber: z.string().optional(),
  utr: z.string().optional(),
  vrn: z.string().optional(),
  nino: z.string().optional(),
  payeRef: z.string().optional(),
  accountsOfficeRef: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  isEmployer: z.boolean().default(false),
  isVatRegistered: z.boolean().default(false),
  /** Skip CH lookup (bulk importer controls batching) */
  skipCompaniesHouse: z.boolean().optional(),
});

const MAX_BULK = 1000;

export type BulkImportRowResult = {
  row: number;
  name: string;
  ok: boolean;
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
  payeRef: string | null;
  accountsOfficeRef: string | null;
  contactEmail: string | null;
  isEmployer: boolean;
  isVatRegistered: boolean;
  companiesHouse: ClientCompaniesHouseSnapshot | null;
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
    payeRef: (row.paye_ref as string | null) ?? null,
    accountsOfficeRef: (row.accounts_office_ref as string | null) ?? null,
    contactEmail: (row.contact_email as string | null) ?? null,
    isEmployer: Boolean(row.is_employer),
    isVatRegistered: Boolean(row.is_vat_registered),
    companiesHouse:
      (row.companies_house as ClientCompaniesHouseSnapshot | null) ?? null,
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

export async function getClient(clientId: string) {
  const session = await requireSession();
  if (isDemoMode()) {
    const client = demoStore.clients.find(
      (c) =>
        c.id === clientId &&
        (c.practiceId === session.practiceId ||
          c.practiceId === demoStore.practice.id),
    );
    if (!client) {
      const { notFound } = await import("next/navigation");
      return notFound();
    }
    return client;
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
      if (!error && data) return mapSupabaseClient(data);
      if (error) {
        console.warn("[clients] supabase get failed", error.message);
      }
    } catch (err) {
      console.warn("[clients] supabase get error", err);
    }
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) {
    const { notFound } = await import("next/navigation");
    return notFound();
  }

  const { clients } = await import("@/server/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select()
    .from(clients)
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    )
    .limit(1);
  if (!rows[0]) {
    const { notFound } = await import("next/navigation");
    return notFound();
  }
  return rows[0];
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
      payeRef: data.payeRef ?? null,
      accountsOfficeRef: data.accountsOfficeRef ?? null,
      contactEmail: data.contactEmail || null,
      isEmployer: data.isEmployer,
      isVatRegistered: data.isVatRegistered,
      companiesHouse: ch,
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
        paye_ref: data.payeRef ?? null,
        accounts_office_ref: data.accountsOfficeRef ?? null,
        contact_email: data.contactEmail || null,
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
      payeRef: data.payeRef ?? null,
      accountsOfficeRef: data.accountsOfficeRef ?? null,
      contactEmail: data.contactEmail || null,
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

/**
 * Import up to 1000 clients from parsed Excel/CSV rows.
 * Limited companies with a company number are enriched via Companies House
 * (batched to respect API rate limits).
 */
export async function bulkImportClients(
  rows: Array<Record<string, unknown>>,
): Promise<{
  created: number;
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

        try {
          if (!name && !(type === "limited_company" && companyNumber)) {
            throw new Error("Missing name");
          }

          const client = await createClient({
            name: name || companyNumber || "Unnamed client",
            type,
            companyNumber,
            utr: cell(raw, "utr"),
            vrn: cell(raw, "vrn", "vat", "vat_number"),
            nino: cell(raw, "nino", "ni"),
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

          return {
            row: rowNum,
            name: client.name,
            ok: true as const,
            clientId: client.id,
            companiesHouse: Boolean(
              "companiesHouse" in client && client.companiesHouse,
            ),
          };
        } catch (err) {
          return {
            row: rowNum,
            name: name || "(blank)",
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
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import type { DeskProfile } from "@/lib/desk-profile";
import {
  SA_TAXPAYER_ROLES,
  displayPersonName,
  mergeTaxpayerRoles,
  normalizePersonName,
  type SaTaxpayer,
  type SaTaxpayerRole,
} from "@/lib/sa-taxpayer";
import { addressIdentityComplete } from "@/lib/address-parts";
import { requireSession } from "@/server/auth/session";
import { demoStore } from "@/server/demo/store";
import { getClient } from "@/server/actions/clients";
import { appendAuditEvent } from "@/server/audit/log";

function mergeProfile(
  current: DeskProfile | null | undefined,
  patch: Partial<DeskProfile>,
): DeskProfile {
  return { ...(current ?? {}), ...patch };
}

async function writeProfile(clientId: string, profile: DeskProfile) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }
  if (session.role === "readonly") throw new Error("Forbidden");

  if (isDemoMode()) {
    const row = demoStore.clients.find((c) => c.id === clientId);
    if (!row) throw new Error("Client not found");
    row.deskProfile = profile;
    row.updatedAt = new Date().toISOString();
    return profile;
  }

  if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .update({
        desk_profile: profile,
        updated_at: new Date().toISOString(),
      })
      .eq("id", clientId)
      .eq("practice_id", session.practiceId);
    if (error) throw new Error(error.message);
    return profile;
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) throw new Error("Client storage is not configured");
  const { eq, and } = await import("drizzle-orm");
  const { clients } = await import("@/server/db/schema");
  await getDb()
    .update(clients)
    .set({ deskProfile: profile, updatedAt: new Date() })
    .where(
      and(eq(clients.id, clientId), eq(clients.practiceId, session.practiceId)),
    );
  return profile;
}

const taxpayerInput = z.object({
  clientId: z.string().min(1),
  id: z.string().optional(),
  fullName: z.string().min(1, "Full name is required"),
  role: z.enum(SA_TAXPAYER_ROLES),
  nino: z.string().default(""),
  /** Personal Self Assessment UTR — not the company CT UTR */
  utr: z.string().default(""),
  dateOfBirth: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  address: z
    .string()
    .default("")
    .refine((v) => !v.trim() || addressIdentityComplete(v), {
      message: "Street address and postcode are required",
    }),
  occupation: z.string().default(""),
  tradingAs: z.string().default(""),
  appointedOn: z.string().nullable().optional(),
  shareholdingNote: z.string().optional(),
  /** Companies House company when role is director / shareholder */
  linkedCompanyNumber: z.string().optional(),
  linkedCompanyName: z.string().optional(),
});

function syntheticTaxpayerFromClient(client: {
  id: string;
  name: string;
  type: string;
  nino: string | null;
  utr: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address?: string | null;
}): SaTaxpayer {
  const now = new Date().toISOString();
  return {
    id: `client-${client.id}`,
    fullName: client.name,
    role: client.type === "partnership" ? "partner" : "sole_trader",
    nino: client.nino ?? "",
    utr: client.utr ?? "",
    dateOfBirth: "",
    email: client.contactEmail ?? "",
    phone: client.contactPhone ?? "",
    address: client.address ?? "",
    createdAt: now,
    updatedAt: now,
  };
}

export async function listSaTaxpayers(clientId: string): Promise<SaTaxpayer[]> {
  const client = await getClient(clientId);
  const stored = client.deskProfile?.saTaxpayers ?? [];
  if (stored.length > 0) return stored;

  // Sole traders / partners default to one taxpayer from the client record.
  if (client.type === "sole_trader" || client.type === "partnership") {
    return [syntheticTaxpayerFromClient(client)];
  }

  return [];
}

async function maxPeopleAllowed(): Promise<number | null> {
  try {
    const { getPracticeEntitlements } = await import(
      "@/server/actions/account"
    );
    const ent = await getPracticeEntitlements();
    return ent.maxClients;
  } catch {
    return null;
  }
}

export async function upsertSaTaxpayer(input: z.infer<typeof taxpayerInput>) {
  const session = await requireSession();
  const data = taxpayerInput.parse(input);
  const client = await getClient(data.clientId);
  const now = new Date().toISOString();
  let existing = [...(client.deskProfile?.saTaxpayers ?? [])];
  // Seed the synthetic sole-trader / partner row so the first save updates
  // that person instead of creating a second UUID and renaming the card.
  if (
    existing.length === 0 &&
    (client.type === "sole_trader" || client.type === "partnership")
  ) {
    existing = [syntheticTaxpayerFromClient(client)];
  }

  const nameKey = normalizePersonName(data.fullName);
  const explicitId = data.id?.trim() || "";
  const isNew =
    !explicitId &&
    !existing.some((t) => normalizePersonName(t.fullName) === nameKey);

  const maxPeople = await maxPeopleAllowed();
  if (isNew && maxPeople != null && existing.length >= maxPeople) {
    throw new Error(
      `Your plan allows ${maxPeople} ${maxPeople === 1 ? "person" : "people"}. Upgrade on Pricing to add more individuals.`,
    );
  }

  // Prefer explicit id; otherwise merge into an existing person with the same name.
  // Never silently reuse the only sole-trader row without an id — that looked
  // like "Add person" editing the original client. Cap + isNew handles Solo.
  const id =
    explicitId ||
    existing.find((t) => normalizePersonName(t.fullName) === nameKey)?.id ||
    crypto.randomUUID();
  const prev = existing.find((t) => t.id === id);
  // Explicit save uses the submitted role (so CH corrections can demote
  // a wrongly stored director_shareholder back to shareholder-only).
  const row: SaTaxpayer = {
    id,
    fullName: displayPersonName(data.fullName.trim()),
    role: data.role as SaTaxpayerRole,
    nino: data.nino.trim().toUpperCase() || prev?.nino || "",
    utr: data.utr.trim() || prev?.utr || "",
    dateOfBirth: data.dateOfBirth.trim() || prev?.dateOfBirth || "",
    email: data.email.trim() || prev?.email || "",
    phone: data.phone.trim() || prev?.phone || "",
    address: data.address.trim() || prev?.address || "",
    occupation: data.occupation.trim() || prev?.occupation || "",
    tradingAs: data.tradingAs.trim() || prev?.tradingAs || "",
    appointedOn: data.appointedOn ?? prev?.appointedOn ?? null,
    shareholdingNote:
      data.shareholdingNote?.trim() || prev?.shareholdingNote || "",
    companyIncomes: prev?.companyIncomes,
    otherIncomes: prev?.otherIncomes,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };

  const idx = existing.findIndex((t) => t.id === id);
  if (idx >= 0) existing[idx] = row;
  else existing.push(row);

  // Drop any other rows that are the same person under a different spelling.
  for (let i = existing.length - 1; i >= 0; i -= 1) {
    const t = existing[i]!;
    if (t.id === id) continue;
    if (normalizePersonName(t.fullName) !== nameKey) continue;
    row.role = mergeTaxpayerRoles(row.role, t.role);
    row.nino = row.nino || t.nino;
    row.utr = row.utr || t.utr;
    row.companyIncomes = [
      ...(row.companyIncomes ?? []),
      ...(t.companyIncomes ?? []).filter(
        (c) => !(row.companyIncomes ?? []).some((e) => e.clientId === c.clientId),
      ),
    ];
    row.otherIncomes = [
      ...(row.otherIncomes ?? []),
      ...(t.otherIncomes ?? []).filter(
        (o) => !(row.otherIncomes ?? []).some((e) => e.id === o.id),
      ),
    ];
    existing.splice(i, 1);
  }
  const keepIdx = existing.findIndex((t) => t.id === id);
  if (keepIdx >= 0) existing[keepIdx] = row;

  const companyNumber = (data.linkedCompanyNumber ?? "").trim().toUpperCase();
  const companyName = (data.linkedCompanyName ?? "").trim();
  if (
    companyNumber &&
    (row.role === "director" ||
      row.role === "shareholder" ||
      row.role === "director_shareholder")
  ) {
    const linked = await ensureLinkedCompanyForTaxpayer({
      practiceId: session.practiceId,
      userId: session.userId,
      companyNumber,
      companyName: companyName || companyNumber,
      role: row.role,
      homeClientId: data.clientId,
    });
    const incomes = [...(row.companyIncomes ?? [])];
    const hit = incomes.findIndex(
      (c) =>
        c.companyNumber.toUpperCase() === companyNumber ||
        c.clientId === linked.clientId,
    );
    const { emptyCompanyIncome } = await import("@/lib/sa-income");
    const nextIncome = emptyCompanyIncome({
      clientId: linked.clientId,
      companyName: linked.companyName,
      companyNumber: linked.companyNumber,
      role: row.role,
      ...(hit >= 0 ? incomes[hit] : {}),
    });
    if (hit >= 0) incomes[hit] = nextIncome;
    else incomes.push(nextIncome);
    row.companyIncomes = incomes;
    if (keepIdx >= 0) existing[keepIdx] = row;
  }

  await writeProfile(
    data.clientId,
    mergeProfile(client.deskProfile, { saTaxpayers: existing }),
  );

  // Keep the desk client card in sync when editing the synthetic sole/partner row.
  if (id === `client-${data.clientId}`) {
    try {
      const { updateClient } = await import("@/server/actions/clients");
      await updateClient({
        clientId: data.clientId,
        name: row.fullName,
        nino: row.nino || undefined,
        utr: row.utr || undefined,
        address: row.address || undefined,
        contactEmail: row.email || undefined,
        contactPhone: row.phone || undefined,
      });
    } catch {
      /* best-effort — taxpayer row is already saved */
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: idx >= 0 ? "sa.taxpayer.update" : "sa.taxpayer.create",
    entityType: "sa_taxpayer",
    entityId: id,
    detail: { fullName: row.fullName, role: row.role },
  });

  revalidatePath(`/clients/${data.clientId}/self-assessment`);
  return row;
}

/** Find or create a limited-company client for CS / accounts reminders. */
async function ensureLinkedCompanyForTaxpayer(input: {
  practiceId: string;
  userId: string;
  companyNumber: string;
  companyName: string;
  role: "director" | "shareholder" | "director_shareholder";
  homeClientId: string;
}): Promise<{ clientId: string; companyName: string; companyNumber: string }> {
  const { listClients, createClient, getClient } = await import(
    "@/server/actions/clients"
  );
  const number = input.companyNumber.trim().toUpperCase();
  const clients = await listClients();
  const existing = clients.find(
    (c) =>
      c.type === "limited_company" &&
      (c.companyNumber ?? "").toUpperCase() === number,
  );
  if (existing) {
    return {
      clientId: existing.id,
      companyName: existing.name,
      companyNumber: existing.companyNumber ?? number,
    };
  }

  try {
    const created = await createClient({
      name: input.companyName,
      type: "limited_company",
      companyNumber: number,
      isEmployer: false,
      isVatRegistered: false,
    });
    return {
      clientId: created.id,
      companyName: created.name,
      companyNumber: created.companyNumber ?? number,
    };
  } catch (err) {
    // Solo / plan cap — keep company on the person record using home client id.
    const msg = err instanceof Error ? err.message : "";
    if (!/plan allows|upgrade on pricing/i.test(msg)) throw err;
    const home = await getClient(input.homeClientId);
    try {
      const { enrolCompanyFilingReminders } = await import(
        "@/server/billing/company-filing-reminders"
      );
      await enrolCompanyFilingReminders({
        userId: input.userId,
        practiceId: input.practiceId,
        email: home.contactEmail ?? "",
      });
    } catch {
      /* optional */
    }
    return {
      clientId: input.homeClientId,
      companyName: input.companyName,
      companyNumber: number,
    };
  }
}

/** Persist a full taxpayer row (used by multi-company income workspace). */
export async function syncWriteTaxpayer(
  clientId: string,
  row: SaTaxpayer,
  opts?: { revalidate?: boolean },
): Promise<SaTaxpayer> {
  const session = await requireSession();
  const client = await getClient(clientId);
  const existing = [...(client.deskProfile?.saTaxpayers ?? [])];
  const next = { ...row, updatedAt: new Date().toISOString() };
  const idx = existing.findIndex((t) => t.id === row.id);
  if (idx >= 0) existing[idx] = next;
  else existing.push(next);
  await writeProfile(
    clientId,
    mergeProfile(client.deskProfile, { saTaxpayers: existing }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "sa.taxpayer.incomes",
    entityType: "sa_taxpayer",
    entityId: row.id,
  });
  // Never call revalidatePath from a Server Component render path
  // (e.g. getDirectorWorkspace). Explicit saves pass revalidate: true.
  if (opts?.revalidate !== false) {
    revalidatePath(`/clients/${clientId}/self-assessment`);
  }
  return next;
}

export async function deleteSaTaxpayer(clientId: string, taxpayerId: string) {
  const session = await requireSession();
  const client = await getClient(clientId);
  const next = (client.deskProfile?.saTaxpayers ?? []).filter(
    (t) => t.id !== taxpayerId,
  );
  await writeProfile(
    clientId,
    mergeProfile(client.deskProfile, { saTaxpayers: next }),
  );
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "sa.taxpayer.delete",
    entityType: "sa_taxpayer",
    entityId: taxpayerId,
  });
  revalidatePath(`/clients/${clientId}/self-assessment`);
}

/** Seed director / shareholder rows from the Companies House snapshot on the client. */
export async function syncSaTaxpayersFromCompaniesHouse(clientId: string) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (client.type !== "limited_company") {
    throw new Error("Companies House sync is for limited company clients");
  }

  const snap = client.companiesHouse;
  const now = new Date().toISOString();
  let added = 0;

  // One row per person — CH officer vs PSC spellings share a normalized key.
  const byKey = new Map<string, SaTaxpayer>();
  for (const t of client.deskProfile?.saTaxpayers ?? []) {
    const key = normalizePersonName(t.fullName);
    if (!key) continue;
    const hit = byKey.get(key);
    if (!hit) {
      byKey.set(key, { ...t });
      continue;
    }
    hit.role = mergeTaxpayerRoles(hit.role, t.role);
    hit.nino = hit.nino || t.nino;
    hit.utr = hit.utr || t.utr;
    hit.dateOfBirth = hit.dateOfBirth || t.dateOfBirth;
    hit.email = hit.email || t.email;
    hit.phone = hit.phone || t.phone;
    hit.address = hit.address || t.address;
    hit.appointedOn = hit.appointedOn || t.appointedOn;
    hit.shareholdingNote = hit.shareholdingNote || t.shareholdingNote;
    hit.companyIncomes = [
      ...(hit.companyIncomes ?? []),
      ...(t.companyIncomes ?? []).filter(
        (c) => !(hit.companyIncomes ?? []).some((e) => e.clientId === c.clientId),
      ),
    ];
    hit.otherIncomes = [
      ...(hit.otherIncomes ?? []),
      ...(t.otherIncomes ?? []).filter(
        (o) => !(hit.otherIncomes ?? []).some((e) => e.id === o.id),
      ),
    ];
    hit.fullName = displayPersonName(hit.fullName || t.fullName);
    hit.updatedAt = now;
  }

  const upsert = (
    name: string,
    role: SaTaxpayerRole,
    appointedOn: string | null,
    shareholdingNote?: string,
  ) => {
    const key = normalizePersonName(name);
    if (!key) return;
    const hit = byKey.get(key);
    if (hit) {
      hit.role = mergeTaxpayerRoles(hit.role, role);
      hit.appointedOn = hit.appointedOn || appointedOn;
      if (shareholdingNote) {
        hit.shareholdingNote = hit.shareholdingNote || shareholdingNote;
      }
      hit.fullName = displayPersonName(hit.fullName || name);
      hit.updatedAt = now;
      return;
    }
    byKey.set(key, {
      id: crypto.randomUUID(),
      fullName: displayPersonName(name),
      role,
      nino: "",
      utr: "",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      appointedOn,
      shareholdingNote: shareholdingNote ?? "",
      createdAt: now,
      updatedAt: now,
    });
    added += 1;
  };

  for (const d of snap?.directors ?? []) {
    const name = (d.name ?? "").trim();
    if (!name || d.resignedOn) continue;
    upsert(name, "director", d.appointedOn);
  }

  for (const p of snap?.pscs ?? []) {
    if (p.ceasedOn || !p.name?.trim()) continue;
    upsert(
      p.name.trim(),
      "shareholder",
      p.notifiedOn,
      p.naturesOfControl?.length
        ? p.naturesOfControl.join("; ")
        : "PSC / shareholder",
    );
  }

  const existing = [...byKey.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, "en-GB"),
  );

  await writeProfile(
    clientId,
    mergeProfile(client.deskProfile, { saTaxpayers: existing }),
  );

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "sa.taxpayer.sync_ch",
    entityType: "client",
    entityId: clientId,
    detail: { added, total: existing.length },
  });

  revalidatePath(`/clients/${clientId}/self-assessment`);
  return { added, total: existing.length };
}

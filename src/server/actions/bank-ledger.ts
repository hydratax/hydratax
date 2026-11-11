"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoMode, isSupabaseConfigured } from "@/lib/env";
import type { DeskProfile } from "@/lib/desk-profile";
import {
  emptyBankLedger,
  assetClosingNbvPence,
  categoryOutflowPence,
  creditorClosingPence,
  debtorClosingPence,
  loanClosingPence,
  mortgageInterestPaidPence,
  type BankLedger,
  type CreditorAccount,
  type DebtorAccount,
  type LivePlSummary,
  type LoanAccount,
  type PropertyAsset,
  type TangibleAsset,
} from "@/lib/bank-ledger";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { listBankTransactions } from "@/server/actions/bank";
import { loadPriorYearComparatives } from "@/server/accounts/load-prior-year-comparatives";
import { enrichAccountsDraftFromLedger } from "@/server/accounts/enrich-accounts-from-ledger";
import { summariseForYearEndAccounts } from "@/server/accounts/year-end-from-bank";
import type { CategorisedLine } from "@/server/bank/categorise";
import { companiesHouseAccountsPeriod } from "@/lib/accounting-periods";
import { parseComparatives } from "@/lib/accounting-periods";

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
    const { demoStore } = await import("@/server/demo/store");
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

function readLedger(client: { deskProfile?: DeskProfile | null }): BankLedger {
  const raw = client.deskProfile?.bankLedger;
  if (!raw || typeof raw !== "object") return emptyBankLedger();
  return {
    ...emptyBankLedger(),
    ...raw,
    loans: Array.isArray(raw.loans) ? raw.loans : [],
    assets: Array.isArray(raw.assets) ? raw.assets : [],
    properties: Array.isArray(raw.properties) ? raw.properties : [],
    debtors: Array.isArray(raw.debtors) ? raw.debtors : [],
    creditors: Array.isArray(raw.creditors) ? raw.creditors : [],
    unpaidShareCapitalPence: raw.unpaidShareCapitalPence ?? 0,
  };
}

async function saveLedger(clientId: string, ledger: BankLedger) {
  const client = await getClient(clientId);
  const next = mergeProfile(client.deskProfile, {
    bankLedger: { ...ledger, updatedAt: new Date().toISOString() },
  });
  await writeProfile(clientId, next);
  revalidatePath(`/clients/${clientId}/bank`);
  revalidatePath(`/clients/${clientId}/accounts-pack`);
  revalidatePath(`/clients/${clientId}/year-end`);
  return readLedger({ deskProfile: next });
}

export async function getBankLedger(clientId: string): Promise<BankLedger> {
  const client = await getClient(clientId);
  return readLedger(client);
}

const periodSchema = z.object({
  clientId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function setBankLedgerPeriod(input: z.infer<typeof periodSchema>) {
  const data = periodSchema.parse(input);
  const client = await getClient(data.clientId);
  const ledger = readLedger(client);
  return saveLedger(data.clientId, {
    ...ledger,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
  });
}

const loanSchema = z.object({
  clientId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["director", "bank", "hp", "other"]),
  broughtForwardPence: z.number().int(),
  repaymentCategory: z.string().nullable().optional(),
  advanceCategory: z.string().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export async function upsertBankLoan(input: z.infer<typeof loanSchema>) {
  const data = loanSchema.parse(input);
  const client = await getClient(data.clientId);
  const ledger = readLedger(client);
  const now = new Date().toISOString();
  const row: LoanAccount = {
    id: data.id ?? crypto.randomUUID(),
    name: data.name,
    kind: data.kind,
    broughtForwardPence: data.broughtForwardPence,
    repaymentCategory: data.repaymentCategory ?? null,
    advanceCategory: data.advanceCategory ?? null,
    notes: data.notes,
    createdAt:
      ledger.loans.find((l) => l.id === data.id)?.createdAt ?? now,
  };
  const loans = data.id
    ? ledger.loans.map((l) => (l.id === data.id ? row : l))
    : [...ledger.loans, row];
  return saveLedger(data.clientId, { ...ledger, loans });
}

export async function deleteBankLoan(clientId: string, loanId: string) {
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  return saveLedger(clientId, {
    ...ledger,
    loans: ledger.loans.filter((l) => l.id !== loanId),
  });
}

const assetSchema = z.object({
  clientId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  class: z.enum(["vehicle", "plant", "fixtures", "other"]),
  acquiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  costPence: z.number().int().nonnegative(),
  broughtForwardNbvPence: z.number().int().nonnegative(),
  method: z.enum(["reducing_balance", "straight_line"]),
  ratePercent: z.number().min(0).max(100),
  residualPence: z.number().int().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

export async function upsertBankAsset(input: z.infer<typeof assetSchema>) {
  const data = assetSchema.parse(input);
  const client = await getClient(data.clientId);
  const ledger = readLedger(client);
  const now = new Date().toISOString();
  const row: TangibleAsset = {
    id: data.id ?? crypto.randomUUID(),
    name: data.name,
    class: data.class,
    acquiredOn: data.acquiredOn,
    costPence: data.costPence,
    broughtForwardNbvPence: data.broughtForwardNbvPence,
    method: data.method,
    ratePercent: data.ratePercent,
    residualPence: data.residualPence,
    notes: data.notes,
    createdAt:
      ledger.assets.find((a) => a.id === data.id)?.createdAt ?? now,
  };
  const assets = data.id
    ? ledger.assets.map((a) => (a.id === data.id ? row : a))
    : [...ledger.assets, row];
  return saveLedger(data.clientId, { ...ledger, assets });
}

export async function deleteBankAsset(clientId: string, assetId: string) {
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  return saveLedger(clientId, {
    ...ledger,
    assets: ledger.assets.filter((a) => a.id !== assetId),
  });
}

const propertySchema = z.object({
  clientId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  address: z.string().max(300).optional(),
  acquiredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  costPence: z.number().int().nonnegative(),
  notes: z.string().max(500).optional(),
  mortgages: z
    .array(
      z.object({
        id: z.string().optional(),
        lender: z.string().trim().min(1).max(120),
        broughtForwardPence: z.number().int(),
        interestDuePence: z.number().int().nonnegative(),
        interestPaidPence: z.number().int().nonnegative().nullable(),
        interestPaidCategory: z.string().nullable().optional(),
        capitalCategory: z.string().nullable().optional(),
        notes: z.string().max(300).optional(),
      }),
    )
    .default([]),
});

export async function upsertBankProperty(
  input: z.infer<typeof propertySchema>,
) {
  const data = propertySchema.parse(input);
  const client = await getClient(data.clientId);
  const ledger = readLedger(client);
  const now = new Date().toISOString();
  const existing = data.id
    ? ledger.properties.find((p) => p.id === data.id)
    : undefined;
  const row: PropertyAsset = {
    id: data.id ?? crypto.randomUUID(),
    name: data.name,
    address: data.address,
    acquiredOn: data.acquiredOn || undefined,
    costPence: data.costPence,
    notes: data.notes,
    createdAt: existing?.createdAt ?? now,
    mortgages: data.mortgages.map((m) => ({
      id: m.id ?? crypto.randomUUID(),
      lender: m.lender,
      broughtForwardPence: m.broughtForwardPence,
      interestDuePence: m.interestDuePence,
      interestPaidPence: m.interestPaidPence,
      interestPaidCategory: m.interestPaidCategory ?? "finance",
      capitalCategory: m.capitalCategory ?? null,
      notes: m.notes,
    })),
  };
  const properties = data.id
    ? ledger.properties.map((p) => (p.id === data.id ? row : p))
    : [...ledger.properties, row];
  return saveLedger(data.clientId, { ...ledger, properties });
}

export async function deleteBankProperty(clientId: string, propertyId: string) {
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  return saveLedger(clientId, {
    ...ledger,
    properties: ledger.properties.filter((p) => p.id !== propertyId),
  });
}

const debtorSchema = z.object({
  clientId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  bucket: z.enum([
    "trade",
    "vat",
    "paye",
    "tax",
    "unpaid_share_capital",
    "other",
  ]),
  broughtForwardPence: z.number().int(),
  invoicesPence: z.number().int().nonnegative().default(0),
  receiptsPence: z.number().int().nonnegative().nullable().optional(),
  bankCategory: z.string().nullable().optional(),
  closingOverridePence: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export async function upsertBankDebtor(input: z.infer<typeof debtorSchema>) {
  const data = debtorSchema.parse(input);
  const client = await getClient(data.clientId);
  const ledger = readLedger(client);
  const now = new Date().toISOString();
  const row: DebtorAccount = {
    id: data.id ?? crypto.randomUUID(),
    name: data.name,
    bucket: data.bucket,
    broughtForwardPence: data.broughtForwardPence,
    invoicesPence: data.invoicesPence,
    receiptsPence: data.receiptsPence ?? null,
    bankCategory: data.bankCategory ?? null,
    closingOverridePence: data.closingOverridePence ?? null,
    notes: data.notes,
    createdAt:
      ledger.debtors.find((d) => d.id === data.id)?.createdAt ?? now,
  };
  const debtors = data.id
    ? ledger.debtors.map((d) => (d.id === data.id ? row : d))
    : [...ledger.debtors, row];
  return saveLedger(data.clientId, { ...ledger, debtors });
}

export async function deleteBankDebtor(clientId: string, debtorId: string) {
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  return saveLedger(clientId, {
    ...ledger,
    debtors: ledger.debtors.filter((d) => d.id !== debtorId),
  });
}

const creditorSchema = z.object({
  clientId: z.string().min(1),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  bucket: z.enum([
    "trade",
    "corporation_tax",
    "accountancy",
    "accruals",
    "vat",
    "paye",
    "bank_overdraft",
    "other",
    "after_one_year",
  ]),
  broughtForwardPence: z.number().int(),
  billsPence: z.number().int().nonnegative().default(0),
  paymentsPence: z.number().int().nonnegative().nullable().optional(),
  bankCategory: z.string().nullable().optional(),
  closingOverridePence: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export async function upsertBankCreditor(
  input: z.infer<typeof creditorSchema>,
) {
  const data = creditorSchema.parse(input);
  const client = await getClient(data.clientId);
  const ledger = readLedger(client);
  const now = new Date().toISOString();
  const row: CreditorAccount = {
    id: data.id ?? crypto.randomUUID(),
    name: data.name,
    bucket: data.bucket,
    broughtForwardPence: data.broughtForwardPence,
    billsPence: data.billsPence,
    paymentsPence: data.paymentsPence ?? null,
    bankCategory: data.bankCategory ?? null,
    closingOverridePence: data.closingOverridePence ?? null,
    notes: data.notes,
    createdAt:
      ledger.creditors.find((c) => c.id === data.id)?.createdAt ?? now,
  };
  const creditors = data.id
    ? ledger.creditors.map((c) => (c.id === data.id ? row : c))
    : [...ledger.creditors, row];
  return saveLedger(data.clientId, { ...ledger, creditors });
}

export async function deleteBankCreditor(
  clientId: string,
  creditorId: string,
) {
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  return saveLedger(clientId, {
    ...ledger,
    creditors: ledger.creditors.filter((c) => c.id !== creditorId),
  });
}

export async function setUnpaidShareCapital(input: {
  clientId: string;
  unpaidShareCapitalPence: number;
}) {
  const clientId = z.string().min(1).parse(input.clientId);
  const unpaid = z.number().int().nonnegative().parse(input.unpaidShareCapitalPence);
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  return saveLedger(clientId, {
    ...ledger,
    unpaidShareCapitalPence: unpaid,
  });
}

const capitalAllowancesSchema = z.object({
  clientId: z.string().min(1),
  aiaClaimPence: z.number().int().nonnegative(),
  mainPoolWdaPence: z.number().int().nonnegative(),
  specialRateWdaPence: z.number().int().nonnegative(),
  otherAllowancesPence: z.number().int().nonnegative().default(0),
  notes: z.string().max(500).optional(),
});

/** Save CT capital allowances claim for the bank year-end ledger period. */
export async function setCapitalAllowances(
  input: z.infer<typeof capitalAllowancesSchema>,
) {
  const data = capitalAllowancesSchema.parse(input);
  const client = await getClient(data.clientId);
  const ledger = readLedger(client);
  return saveLedger(data.clientId, {
    ...ledger,
    capitalAllowances: {
      aiaClaimPence: data.aiaClaimPence,
      mainPoolWdaPence: data.mainPoolWdaPence,
      specialRateWdaPence: data.specialRateWdaPence,
      otherAllowancesPence: data.otherAllowancesPence,
      notes: data.notes,
    },
  });
}

/** Copy priorClosing snapshot into brought-forward balances for this year. */
export async function bringForwardBankLedger(clientId: string) {
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  const prior = ledger.priorClosing;
  if (!prior) {
    return {
      ok: false as const,
      error:
        "No prior-year closing snapshot yet. Save a closing snapshot at the end of last year, or add loan/asset balances manually.",
      ledger,
    };
  }
  const now = new Date().toISOString();
  const next: BankLedger = {
    ...ledger,
    loans: prior.loans.map((l) => ({
      id: crypto.randomUUID(),
      name: l.name,
      kind: l.kind,
      broughtForwardPence: l.closingPence,
      createdAt: now,
    })),
    assets: prior.assets.map((a) => ({
      id: crypto.randomUUID(),
      name: a.name,
      class: a.class,
      acquiredOn: `${Number(prior.periodEnd.slice(0, 4)) - 5}-04-01`,
      costPence: a.costPence,
      broughtForwardNbvPence: a.closingNbvPence,
      method: a.method,
      ratePercent: a.ratePercent,
      createdAt: now,
    })),
    properties: prior.properties.map((p) => ({
      id: crypto.randomUUID(),
      name: p.name,
      costPence: p.costPence,
      createdAt: now,
      mortgages: p.mortgages.map((m) => ({
        id: crypto.randomUUID(),
        lender: m.lender,
        broughtForwardPence: m.closingPence,
        interestDuePence: 0,
        interestPaidPence: null,
        interestPaidCategory: "finance",
      })),
    })),
    debtors: (prior.debtors ?? []).map((d) => ({
      id: crypto.randomUUID(),
      name: d.name,
      bucket: d.bucket,
      broughtForwardPence: d.closingPence,
      invoicesPence: 0,
      receiptsPence: null,
      closingOverridePence: null,
      createdAt: now,
    })),
    creditors: (prior.creditors ?? []).map((c) => ({
      id: crypto.randomUUID(),
      name: c.name,
      bucket: c.bucket,
      broughtForwardPence: c.closingPence,
      billsPence: 0,
      paymentsPence: null,
      closingOverridePence: null,
      createdAt: now,
    })),
  };
  const saved = await saveLedger(clientId, next);
  return { ok: true as const, ledger: saved };
}

/** Snapshot current closing balances as next year's brought-forward source. */
export async function snapshotBankLedgerClosing(clientId: string) {
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  const periodEnd =
    ledger.periodEnd ??
    new Date().toISOString().slice(0, 10);
  const periodStart = ledger.periodStart ?? periodEnd;
  const txs = await listBankTransactions(clientId);
  const lines = txs.map((t) => ({
    category: t.category,
    amountPence: t.amountPence,
    dated: t.dated,
  }));

  const priorClosing: NonNullable<BankLedger["priorClosing"]> = {
    periodEnd,
    loans: ledger.loans.map((l) => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      closingPence: loanClosingPence(l, lines, periodStart, periodEnd),
    })),
    assets: ledger.assets.map((a) => ({
      id: a.id,
      name: a.name,
      class: a.class,
      costPence: a.costPence,
      closingNbvPence: assetClosingNbvPence(a, periodStart, periodEnd),
      method: a.method,
      ratePercent: a.ratePercent,
    })),
    properties: ledger.properties.map((p) => ({
      id: p.id,
      name: p.name,
      costPence: p.costPence,
      mortgages: p.mortgages.map((m) => {
        const capital = categoryOutflowPence(
          lines,
          m.capitalCategory,
          periodStart,
          periodEnd,
        );
        return {
          id: m.id,
          lender: m.lender,
          closingPence: m.broughtForwardPence - capital,
        };
      }),
    })),
    debtors: ledger.debtors.map((d) => ({
      id: d.id,
      name: d.name,
      bucket: d.bucket,
      closingPence: debtorClosingPence(d, lines, periodStart, periodEnd),
    })),
    creditors: ledger.creditors.map((c) => ({
      id: c.id,
      name: c.name,
      bucket: c.bucket,
      closingPence: creditorClosingPence(c, lines, periodStart, periodEnd),
    })),
  };

  const saved = await saveLedger(clientId, { ...ledger, priorClosing });
  return { ok: true as const, ledger: saved };
}

export async function pullPriorYearIntoBankDesk(clientId: string) {
  const client = await getClient(clientId);
  const ch =
    "companiesHouse" in client ? client.companiesHouse : null;
  const ledger = readLedger(client);
  const periodEnd =
    ledger.periodEnd ??
    ch?.accountsPeriodEnd ??
    ch?.lastAccountsMadeUpTo ??
    null;

  const prior = await loadPriorYearComparatives({
    clientId,
    companyNumber: client.companyNumber ?? ch?.companyNumber ?? null,
    periodEnd,
    savedComparatives:
      "accountsComparatives" in client ? client.accountsComparatives : null,
  });

  // Persist cash + P&L reserve as accounts comparatives when pulled.
  if (prior.source !== "none") {
    const comps = {
      ...parseComparatives(
        "accountsComparatives" in client ? client.accountsComparatives : null,
      ),
      ...prior.comparatives,
    };
    if (isDemoMode()) {
      const { demoStore } = await import("@/server/demo/store");
      const row = demoStore.clients.find((c) => c.id === clientId);
      if (row) {
        (row as { accountsComparatives?: unknown }).accountsComparatives =
          comps;
      }
    } else if (isSupabaseConfigured()) {
      const session = await requireSession();
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("clients")
        .update({
          accounts_comparatives: comps,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId)
        .eq("practice_id", session.practiceId);
    }
  }

  revalidatePath(`/clients/${clientId}/bank`);
  revalidatePath(`/clients/${clientId}/accounts-pack`);
  return prior;
}

export async function getLivePlFromBank(
  clientId: string,
): Promise<{
  pl: LivePlSummary;
  yearEnd: ReturnType<typeof summariseForYearEndAccounts>;
  ledger: BankLedger;
  periodStart: string;
  periodEnd: string;
}> {
  const client = await getClient(clientId);
  const ledger = readLedger(client);
  const txs = await listBankTransactions(clientId);
  const ch =
    "companiesHouse" in client ? client.companiesHouse : null;
  const poa = companiesHouseAccountsPeriod({
    incorporatedOn: ch?.incorporatedOn,
    accountsPeriodEnd: ch?.accountsPeriodEnd,
    lastAccountsMadeUpTo: ch?.lastAccountsMadeUpTo,
  });

  const dated = txs.map((t) => t.dated).filter(Boolean).sort();
  const periodStart =
    ledger.periodStart ||
    poa.start ||
    dated[0] ||
    `${new Date().getFullYear()}-04-01`;
  const periodEnd =
    ledger.periodEnd ||
    poa.end ||
    dated[dated.length - 1] ||
    `${new Date().getFullYear() + 1}-03-31`;

  const lines: CategorisedLine[] = txs.map((t) => ({
    dated: t.dated,
    description: t.description,
    amountPence: t.amountPence,
    category: t.category,
    confidence: (t.confidence as CategorisedLine["confidence"]) ?? "low",
  }));
  const bankLines = lines.map((l) => ({
    category: l.category,
    amountPence: l.amountPence,
    dated: l.dated,
  }));

  const comps = parseComparatives(
    "accountsComparatives" in client ? client.accountsComparatives : null,
  );
  const mortgagePaid = ledger.properties.reduce(
    (s, p) =>
      s +
      p.mortgages.reduce(
        (ms, m) =>
          ms + mortgageInterestPaidPence(m, bankLines, periodStart, periodEnd),
        0,
      ),
    0,
  );
  const mortgageDue = ledger.properties.reduce(
    (s, p) => s + p.mortgages.reduce((ms, m) => ms + m.interestDuePence, 0),
    0,
  );
  const fixedNbv = ledger.assets.reduce(
    (s, a) => s + assetClosingNbvPence(a, periodStart, periodEnd),
    0,
  );
  const propertyCost = ledger.properties.reduce((s, p) => s + p.costPence, 0);
  const loansClosing = ledger.loans.reduce(
    (s, l) => s + loanClosingPence(l, bankLines, periodStart, periodEnd),
    0,
  );
  const mortgagesClosing = ledger.properties.reduce(
    (s, p) =>
      s +
      p.mortgages.reduce((ms, m) => {
        const capital = categoryOutflowPence(
          bankLines,
          m.capitalCategory,
          periodStart,
          periodEnd,
        );
        return ms + (m.broughtForwardPence - capital);
      }, 0),
    0,
  );

  const rawYearEnd = summariseForYearEndAccounts(lines, {
    periodStart,
    periodEnd,
    openingCashPence: comps.cashAtBankPence ?? undefined,
    retainedBroughtForwardPence: comps.profitAndLossReservePence ?? undefined,
    fixedAssetsPence: fixedNbv + propertyCost > 0 ? fixedNbv + propertyCost : undefined,
    creditorsAfterOneYearPence:
      loansClosing + mortgagesClosing > 0
        ? loansClosing + mortgagesClosing
        : undefined,
    shareCapitalPence: comps.shareCapitalPence ?? undefined,
  });

  const yearEnd = enrichAccountsDraftFromLedger(
    rawYearEnd,
    ledger,
    bankLines,
    { shareCapitalPence: comps.shareCapitalPence ?? undefined },
  );

  // Fold mortgage interest into admin / finance if not already in bank.
  const expensesFromBank = yearEnd.adminExpensesPence;
  const financeFromBank = yearEnd.note8.finance;
  const extraFinance = Math.max(0, mortgagePaid - financeFromBank);
  const profitBeforeTaxPence =
    yearEnd.grossProfitPence - expensesFromBank - extraFinance;

  const pl: LivePlSummary = {
    turnoverPence: yearEnd.turnoverPence,
    costOfSalesPence: yearEnd.costOfSalesPence,
    grossProfitPence: yearEnd.grossProfitPence,
    expensesPence: expensesFromBank + extraFinance,
    depreciationPence: yearEnd.note8.depreciation,
    financeCostsPence: financeFromBank + extraFinance,
    mortgageInterestPaidPence: mortgagePaid,
    mortgageInterestDuePence: mortgageDue,
    profitBeforeTaxPence,
    fixedAssetsNbvPence: fixedNbv,
    propertyCostPence: propertyCost,
    loansClosingPence: loansClosing,
    mortgagesClosingPence: mortgagesClosing,
    lineCount: yearEnd.lineCount,
    uncategorisedCount: yearEnd.uncategorisedCount,
  };

  return { pl, yearEnd, ledger, periodStart, periodEnd };
}

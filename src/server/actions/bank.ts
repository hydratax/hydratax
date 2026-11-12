"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { isMemoryStore } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import {
  summariseForCorporationTax,
  summariseForSelfAssessment,
  type CategorisedLine,
  type BankCategory,
} from "@/server/bank/categorise";
import { parseBankStatementFile } from "@/server/bank/parse-statement-file";
import { parseUkStatementText } from "@/server/bank/parse-uk-statement-text";
import { parseBankCsv } from "@/server/bank/categorise";
import { summariseForYearEndAccounts } from "@/server/accounts/year-end-from-bank";
import { enrichAccountsDraftFromLedger } from "@/server/accounts/enrich-accounts-from-ledger";
import { emptyBankLedger } from "@/lib/bank-ledger";
import { parseComparatives, companiesHouseAccountsPeriod } from "@/lib/accounting-periods";
import { buildCategoryLabelMap } from "@/lib/bank-categories";
import { deskListCustomBankCategories } from "@/server/db/desk-store";
import { appendAuditEvent } from "@/server/audit/log";
import { tryGetDb } from "@/server/db";
import {
  isDeskStoreConfigured,
  deskListBankTransactions,
  deskInsertBankTransactions,
  deskDeleteBankTransactionsForClient,
  deskDedupeBankTransactionsForClient,
  deskReplaceBankTransactions,
  deskUpdateBankCategory,
  deskUpdateBankCategoriesBulk,
  mapSnakeCaseRow,
} from "@/server/db/desk-store";

function mapDeskBankTransaction(row: Record<string, unknown>) {
  const mapped = mapSnakeCaseRow(row);
  return {
    id: String(mapped.id),
    clientId: String(mapped.clientId),
    dated: String(mapped.dated),
    description: String(mapped.description),
    amountPence: Number(mapped.amountPence),
    balancePence:
      mapped.balancePence == null ? null : Number(mapped.balancePence),
    category: String(
      mapped.category ??
        (Number(mapped.amountPence) > 0 ? "turnover" : "expense_queries"),
    ) as BankCategory,
    matchedLedgerId:
      mapped.matchedLedgerId == null ? null : String(mapped.matchedLedgerId),
    confidence: "low" as const,
    source: "desk",
    createdAt: String(mapped.createdAt),
  };
}

export type BankImportResult =
  | {
      ok: true;
      lines: CategorisedLine[];
      pdfStored: boolean;
      message: string;
      provisionalHeads?: number;
      document?: {
        id: string;
        filename: string;
        blobUrl: string;
        contentType: string;
      };
    }
  | { ok: false; error: string };

async function storeBankSourceFile(
  clientId: string,
  file: File,
): Promise<{
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
} | null> {
  try {
    const { uploadClientDocument } = await import("@/server/actions/documents");
    const fd = new FormData();
    fd.set("clientId", clientId);
    fd.set("category", "accounts");
    fd.set("file", file);
    const doc = await uploadClientDocument(fd);
    return {
      id: doc.id,
      filename: doc.filename,
      blobUrl: doc.blobUrl,
      contentType: doc.contentType,
    };
  } catch {
    // Import can still succeed without archival when storage is unavailable.
    return null;
  }
}

function dedupeImportLines(lines: CategorisedLine[]): CategorisedLine[] {
  const seen = new Set<string>();
  const out: CategorisedLine[] = [];
  for (const line of lines) {
    const key = `${line.dated}|${line.description}|${line.amountPence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export type ConvertedBankLine = {
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: "high" | "medium" | "low";
};

/**
 * Convert extracted statement text → transaction rows (preview / CSV).
 * Does not write to the client ledger unless the caller also saves.
 */
export async function convertBankStatementText(input: {
  text: string;
  source?: "pdf" | "ocr" | "csv";
  /** SA occupation — biases allocation (e.g. taxi → fuel / vehicle). */
  occupation?: string | null;
}): Promise<
  | {
      ok: true;
      lines: ConvertedBankLine[];
      bankHint: string | null;
      message: string;
    }
  | { ok: false; error: string }
> {
  try {
    await requireSession();
    const text = String(input.text ?? "").trim();
    if (!text) {
      return {
        ok: false,
        error:
          "No text could be read from that statement. Try a clearer scan or the bank CSV/Excel export.",
      };
    }

    let lines: CategorisedLine[];
    let bankHint: string | null = null;
    if (input.source === "csv") {
      lines = parseBankCsv(text);
      if (input.occupation) {
        const { categoriseDescription } = await import(
          "@/server/bank/categorise"
        );
        lines = lines.map((line) => {
          const next = categoriseDescription(
            line.description,
            line.amountPence,
            input.occupation,
          );
          return { ...line, ...next };
        });
      }
    } else {
      const parsed = parseUkStatementText(text, {
        occupation: input.occupation,
      });
      lines = parsed.lines;
      bankHint = parsed.meta.bankHint;
    }

    const session = await requireSession();
    const { applyIdentifierRules } = await import(
      "@/server/bank/merchant-identifiers"
    );
    lines = await applyIdentifierRules(
      lines,
      session.practiceId,
      input.occupation,
    );
    lines = dedupeImportLines(lines);

    if (!lines.length) {
      return {
        ok: false,
        error:
          "No transactions could be read from that statement. Check the preview text, or use the bank’s CSV/Excel export.",
      };
    }

    return {
      ok: true,
      lines,
      bankHint,
      message: `Converted ${lines.length} transaction${lines.length === 1 ? "" : "s"}${bankHint ? ` (${bankHint})` : ""}. Download CSV or save to this client’s books.`,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not convert that statement.",
    };
  }
}

/** Persist already-converted lines (from the converter preview) onto the client. */
export async function importBankConvertedLines(input: {
  clientId: string;
  lines: ConvertedBankLine[];
  filename?: string;
  source?: "pdf" | "ocr" | "csv" | "spreadsheet";
  /** SA occupation — keeps trade-biased allocation on save. */
  occupation?: string | null;
}): Promise<BankImportResult> {
  try {
    const session = await requireSession();
    if (session.role === "readonly") {
      return { ok: false, error: "You do not have permission to import bank data." };
    }
    await getClient(input.clientId);
    let lines = dedupeImportLines(input.lines as CategorisedLine[]);
    if (!lines.length) {
      return { ok: false, error: "No transactions to save." };
    }
    const { applyIdentifierRules } = await import(
      "@/server/bank/merchant-identifiers"
    );
    lines = await applyIdentifierRules(
      lines,
      session.practiceId,
      input.occupation,
    );
    lines = dedupeImportLines(lines);
    const { runProvisionalHeadsOnLines } = await import(
      "@/server/bank/run-provisional-heads"
    );
    const provisional = await runProvisionalHeadsOnLines(
      lines,
      session.practiceId,
    );
    lines = provisional.lines;

    const parseSource = input.source ?? "pdf";
    const clientId = input.clientId;

    if (isMemoryStore()) {
      memoryStore.bankTransactions = memoryStore.bankTransactions.filter(
        (t) => t.clientId !== clientId,
      );
      for (const line of lines) {
        memoryStore.bankTransactions.push({
          id: crypto.randomUUID(),
          clientId,
          practiceId: session.practiceId,
          ...line,
          source: parseSource,
          createdAt: new Date().toISOString(),
        });
      }
    } else if (isDeskStoreConfigured()) {
      await deskReplaceBankTransactions(
        clientId,
        lines.map((line) => ({
          client_id: clientId,
          dated: line.dated,
          description: line.description,
          amount_pence: line.amountPence,
          category: line.category,
        })),
      );
    } else {
      const { getDb, hasDatabase } = await import("@/server/db");
      if (!hasDatabase()) {
        return {
          ok: false,
          error:
            "Bank storage is not configured. Contact support if this persists.",
        };
      }
      const { bankTransactions } = await import("@/server/db/schema");
      const { eq } = await import("drizzle-orm");
      await getDb()
        .delete(bankTransactions)
        .where(eq(bankTransactions.clientId, clientId));
      const mapped = lines.map((line) => ({
        practiceId: session.practiceId,
        clientId,
        dated: line.dated,
        description: line.description,
        amountPence: line.amountPence,
        category: line.category,
        confidence: line.confidence,
        source: parseSource,
      }));
      for (let i = 0; i < mapped.length; i += 100) {
        await getDb()
          .insert(bankTransactions)
          .values(mapped.slice(i, i + 100));
      }
    }

    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId,
      actorId: session.userId,
      action: "bank.statement.imported",
      entityType: "bank_transaction",
      entityId: clientId,
      detail: {
        count: lines.length,
        filename: input.filename,
        source: parseSource,
        via: "converter",
      },
    });

    revalidatePath(`/clients/${clientId}/bank`);
    revalidatePath(`/clients/${clientId}/documents`);
    revalidatePath(`/clients/${clientId}/self-assessment`);
    revalidatePath(`/clients/${clientId}/corporation-tax`);
    revalidatePath(`/clients/${clientId}/accounts-pack`);
    revalidatePath(`/self-assessment`);

    const headNote =
      provisional.created.length > 0
        ? ` Created ${provisional.created.length} review head${provisional.created.length === 1 ? "" : "s"} for material unknown payees — map each Review section to the correct accounts head.`
        : "";
    return {
      ok: true,
      lines,
      pdfStored: parseSource === "pdf" || parseSource === "ocr",
      message: `Saved ${lines.length} transactions to this client’s books.${headNote}`,
      provisionalHeads: provisional.created.length,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not save converted lines.",
    };
  }
}

export async function importBankCsv(formData: FormData): Promise<BankImportResult> {
  try {
    const session = await requireSession();
    if (session.role === "readonly") {
      return { ok: false, error: "You do not have permission to import bank data." };
    }

    const clientId = String(formData.get("clientId") ?? "");
    await getClient(clientId);

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "Choose a bank statement file to upload." };
    }

    const name = file.name.toLowerCase();
    let lines: CategorisedLine[] = [];
    let parseSource: "csv" | "spreadsheet" | "pdf" | "ocr" = "csv";
    let bankHint: string | null = null;
    let parseWarning: string | undefined;

    try {
      const parsed = await parseBankStatementFile(file);
      lines = parsed.lines;
      parseSource = parsed.source;
      bankHint = parsed.bankHint;
      parseWarning = parsed.warning;
    } catch (parseErr) {
      const message =
        parseErr instanceof Error
          ? parseErr.message
          : "Could not read that statement file.";
      return { ok: false, error: message };
    }

  if (!lines.length) {
    if (
      parseSource === "pdf" ||
      parseSource === "ocr" ||
      name.endsWith(".pdf") ||
      file.type.startsWith("image/")
    ) {
      await storeBankSourceFile(clientId, file);
      revalidatePath(`/clients/${clientId}/bank`);
      revalidatePath(`/clients/${clientId}/documents`);
      return {
        ok: false,
        error:
          parseWarning ||
          "No transactions could be read from that statement. Try a clearer photo, a text-based PDF, or the bank’s CSV/Excel export.",
      };
    }
    return {
      ok: false,
      error:
        "No transactions were found in that file. For Monzo/Starling exports, use the CSV download from your bank app.",
    };
  }

  const { applyIdentifierRules } = await import(
    "@/server/bank/merchant-identifiers"
  );
  lines = await applyIdentifierRules(lines, session.practiceId);
  lines = dedupeImportLines(lines);
  const { runProvisionalHeadsOnLines } = await import(
    "@/server/bank/run-provisional-heads"
  );
  const provisional = await runProvisionalHeadsOnLines(
    lines,
    session.practiceId,
  );
  lines = provisional.lines;

  if (isMemoryStore()) {
    memoryStore.bankTransactions = memoryStore.bankTransactions.filter(
      (t) => t.clientId !== clientId,
    );
    for (const line of lines) {
      memoryStore.bankTransactions.push({
        id: crypto.randomUUID(),
        clientId,
        practiceId: session.practiceId,
        ...line,
        source: parseSource,
        createdAt: new Date().toISOString(),
      });
    }
  } else if (isDeskStoreConfigured()) {
    try {
      await deskReplaceBankTransactions(
        clientId,
        lines.map((line) => ({
          client_id: clientId,
          dated: line.dated,
          description: line.description,
          amount_pence: line.amountPence,
          category: line.category,
        })),
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save bank transactions.";
      return { ok: false, error: message };
    }
  } else {
    const { getDb, hasDatabase } = await import("@/server/db");
    if (!hasDatabase()) {
      return {
        ok: false,
        error:
          "Bank storage is not configured. Contact support if this persists.",
      };
    }
    const { bankTransactions } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .delete(bankTransactions)
      .where(eq(bankTransactions.clientId, clientId));
    const chunkSize = 100;
    const mapped = lines.map((line) => ({
      practiceId: session.practiceId,
      clientId,
      dated: line.dated,
      description: line.description,
      amountPence: line.amountPence,
      category: line.category,
      confidence: line.confidence,
      source: parseSource,
    }));
    for (let i = 0; i < mapped.length; i += chunkSize) {
      await getDb()
        .insert(bankTransactions)
        .values(mapped.slice(i, i + chunkSize));
    }
  }

  const document = await storeBankSourceFile(clientId, file);

  const needsConfirm = lines.filter(
    (l) =>
      l.confidence === "low" ||
      l.category === "expense_queries" ||
      l.category === "uncategorised",
  ).length;

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "bank.statement.imported",
    entityType: "bank_transaction",
    entityId: clientId,
    detail: {
      count: lines.length,
      filename: file.name,
      documentId: document?.id,
      source: parseSource,
      bankHint,
      needsConfirm,
    },
  });

  revalidatePath(`/clients/${clientId}/bank`);
  revalidatePath(`/clients/${clientId}/documents`);
  revalidatePath(`/clients/${clientId}/self-assessment`);
  revalidatePath(`/clients/${clientId}/corporation-tax`);
  revalidatePath(`/clients/${clientId}/accounts-pack`);

  const bankBit = bankHint ? ` (${bankHint})` : "";
  const confirmBit =
    needsConfirm > 0
      ? ` ${needsConfirm} line${needsConfirm === 1 ? "" : "s"} need review / client confirmation.`
      : "";
  const warnBit = parseWarning ? ` ${parseWarning}` : "";
  const headBit =
    provisional.created.length > 0
      ? ` Created ${provisional.created.length} review head${provisional.created.length === 1 ? "" : "s"} for material unknown payees — map each Review section to the correct accounts head.`
      : "";

  return {
    ok: true,
    lines,
    pdfStored: parseSource === "pdf" || parseSource === "ocr",
    document: document ?? undefined,
    provisionalHeads: provisional.created.length,
    message: `Imported ${lines.length} transactions from ${file.name}${bankBit}.${confirmBit}${headBit}${warnBit} Download categorised CSV or Excel below.`,
  };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bank import failed. Please try again.";
    if (/row-level security|permission denied|not authorized/i.test(message)) {
      return {
        ok: false,
        error: "You do not have permission to save bank data for this client.",
      };
    }
    if (/not configured|desk storage/i.test(message)) {
      return {
        ok: false,
        error: "Bank storage is not configured yet. Please try again shortly.",
      };
    }
    return { ok: false, error: message };
  }
}

export async function listBankTransactions(clientId: string) {
  await getClient(clientId);
  if (isMemoryStore()) {
    return memoryStore.bankTransactions.filter((t) => t.clientId === clientId);
  }
  const deskRows = await deskListBankTransactions(clientId);
  if (deskRows !== null) {
    return deskRows.map((row) => mapDeskBankTransaction(row));
  }
  const db = tryGetDb();
  if (!db) return [];
  const { bankTransactions } = await import("@/server/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return db
    .select()
    .from(bankTransactions)
    .where(eq(bankTransactions.clientId, clientId))
    .orderBy(desc(bankTransactions.dated));
}

export async function updateBankCategory(
  transactionId: string,
  category: string,
) {
  const session = await requireSession();
  let clientId: string | null = null;
  if (isMemoryStore()) {
    const row = memoryStore.bankTransactions.find((t) => t.id === transactionId);
    if (!row) throw new Error("Not found");
    row.category = category;
    row.confidence = "high";
    clientId = row.clientId;
  } else if (isDeskStoreConfigured()) {
    clientId = await deskUpdateBankCategory(transactionId, category);
    if (!clientId) throw new Error("Not found");
  } else {
    const { getDb } = await import("@/server/db");
    const { bankTransactions } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const [updated] = await getDb()
      .update(bankTransactions)
      .set({ category, confidence: "high" })
      .where(eq(bankTransactions.id, transactionId))
      .returning({ clientId: bankTransactions.clientId });
    clientId = updated?.clientId ?? null;
  }
  revalidatePath(`/clients`);
  if (clientId) {
    revalidatePath(`/clients/${clientId}/bank`);
    revalidatePath(`/clients/${clientId}/accounts-pack`);
  }
  return { ok: true, actor: session.userId };
}

export async function updateBankCategoriesBulk(
  transactionIds: string[],
  category: string,
) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }
  const ids = [...new Set(transactionIds.filter(Boolean))];
  if (!ids.length) {
    return { ok: true as const, updated: 0 };
  }

  let clientId: string | null = null;
  let updated = 0;

  if (isMemoryStore()) {
    for (const id of ids) {
      const row = memoryStore.bankTransactions.find((t) => t.id === id);
      if (!row) continue;
      row.category = category;
      row.confidence = "high";
      clientId = row.clientId;
      updated += 1;
    }
  } else if (isDeskStoreConfigured()) {
    clientId = await deskUpdateBankCategoriesBulk(ids, category);
    updated = ids.length;
  } else {
    const { getDb } = await import("@/server/db");
    const { bankTransactions } = await import("@/server/db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    const chunkSize = 100;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const result = await getDb()
        .update(bankTransactions)
        .set({ category, confidence: "high" })
        .where(inArray(bankTransactions.id, chunk))
        .returning({ clientId: bankTransactions.clientId });
      if (result[0]?.clientId) clientId = result[0].clientId;
      updated += result.length;
    }
  }

  revalidatePath(`/clients`);
  if (clientId) {
    revalidatePath(`/clients/${clientId}/bank`);
    revalidatePath(`/clients/${clientId}/accounts-pack`);
  }
  return { ok: true as const, updated };
}

export async function clearBankTransactions(clientId: string) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }
  await getClient(clientId);

  if (isMemoryStore()) {
    const before = memoryStore.bankTransactions.filter(
      (t) => t.clientId === clientId,
    ).length;
    memoryStore.bankTransactions = memoryStore.bankTransactions.filter(
      (t) => t.clientId !== clientId,
    );
    revalidatePath(`/clients/${clientId}/bank`);
    return { ok: true as const, removed: before };
  }

  if (isDeskStoreConfigured()) {
    const txs = await listBankTransactions(clientId);
    await deskDeleteBankTransactionsForClient(clientId);
    revalidatePath(`/clients/${clientId}/bank`);
    revalidatePath(`/clients/${clientId}/accounts-pack`);
    return { ok: true as const, removed: txs.length };
  }

  const { getDb, hasDatabase } = await import("@/server/db");
  if (!hasDatabase()) {
    return { ok: false as const, error: "Bank storage is not configured." };
  }
  const { bankTransactions } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const txs = await listBankTransactions(clientId);
  await getDb()
    .delete(bankTransactions)
    .where(eq(bankTransactions.clientId, clientId));
  revalidatePath(`/clients/${clientId}/bank`);
  revalidatePath(`/clients/${clientId}/accounts-pack`);
  return { ok: true as const, removed: txs.length };
}

export async function dedupeBankTransactions(clientId: string) {
  const session = await requireSession();
  if (session.role === "readonly") {
    return { ok: false as const, error: "Read-only access." };
  }
  await getClient(clientId);

  if (isMemoryStore()) {
    const kept = new Map<string, (typeof memoryStore.bankTransactions)[number]>();
    const toRemove: string[] = [];
    for (const tx of memoryStore.bankTransactions) {
      if (tx.clientId !== clientId) continue;
      const key = `${tx.dated}|${tx.description}|${tx.amountPence}`;
      if (!kept.has(key)) kept.set(key, tx);
      else toRemove.push(tx.id);
    }
    memoryStore.bankTransactions = memoryStore.bankTransactions.filter(
      (t) => !toRemove.includes(t.id),
    );
    revalidatePath(`/clients/${clientId}/bank`);
    return { ok: true as const, removed: toRemove.length };
  }

  if (isDeskStoreConfigured()) {
    const removed = await deskDedupeBankTransactionsForClient(clientId);
    revalidatePath(`/clients/${clientId}/bank`);
    revalidatePath(`/clients/${clientId}/accounts-pack`);
    return { ok: true as const, removed };
  }

  const db = tryGetDb();
  if (!db) {
    return { ok: false as const, error: "Bank storage is not configured." };
  }
  const txs = await listBankTransactions(clientId);
  const seen = new Map<string, string>();
  const deleteIds: string[] = [];
  for (const tx of txs) {
    const key = `${tx.dated}|${tx.description}|${tx.amountPence}`;
    if (!seen.has(key)) seen.set(key, tx.id);
    else deleteIds.push(tx.id);
  }
  if (deleteIds.length) {
    const { bankTransactions } = await import("@/server/db/schema");
    const { eq, inArray } = await import("drizzle-orm");
    await db
      .delete(bankTransactions)
      .where(inArray(bankTransactions.id, deleteIds));
  }
  revalidatePath(`/clients/${clientId}/bank`);
  revalidatePath(`/clients/${clientId}/accounts-pack`);
  return { ok: true as const, removed: deleteIds.length };
}

export async function getTaxDraftFromBank(clientId: string) {
  const client = await getClient(clientId);
  const txs = await listBankTransactions(clientId);
  const lines: CategorisedLine[] = txs.map((t) => ({
    dated: t.dated,
    description: t.description,
    amountPence: t.amountPence,
    category: t.category as BankCategory,
    confidence: (t.confidence as CategorisedLine["confidence"]) ?? "low",
  }));
  return {
    selfAssessment: summariseForSelfAssessment(lines, {
      clientType: client.type,
    }),
    corporationTax: summariseForCorporationTax(lines),
    lineCount: lines.length,
    clientType: client.type,
  };
}

export async function getYearEndAccountsDraftFromBank(
  clientId: string,
  periodStart: string,
  periodEnd: string,
) {
  const session = await requireSession();
  const client = await getClient(clientId);
  const txs = await listBankTransactions(clientId);
  const custom = await deskListCustomBankCategories(session.practiceId);
  const customCategoryLabels = buildCategoryLabelMap(custom);
  const lines: CategorisedLine[] = txs.map((t) => ({
    dated: t.dated,
    description: t.description,
    amountPence: t.amountPence,
    category: t.category,
    confidence: (t.confidence as CategorisedLine["confidence"]) ?? "low",
  }));
  const ch =
    "companiesHouse" in client ? client.companiesHouse : null;
  const poa = companiesHouseAccountsPeriod({
    incorporatedOn: ch?.incorporatedOn,
    accountsPeriodEnd: ch?.accountsPeriodEnd,
    lastAccountsMadeUpTo: ch?.lastAccountsMadeUpTo,
  });
  const comps = parseComparatives(
    "accountsComparatives" in client ? client.accountsComparatives : null,
  );
  const firstYear = poa.firstYear;
  const rawLedger = client.deskProfile?.bankLedger;
  const ledger = rawLedger
    ? {
        ...emptyBankLedger(),
        ...rawLedger,
        loans: Array.isArray(rawLedger.loans) ? rawLedger.loans : [],
        assets: Array.isArray(rawLedger.assets) ? rawLedger.assets : [],
        properties: Array.isArray(rawLedger.properties)
          ? rawLedger.properties
          : [],
        debtors: Array.isArray(rawLedger.debtors) ? rawLedger.debtors : [],
        creditors: Array.isArray(rawLedger.creditors)
          ? rawLedger.creditors
          : [],
      }
    : emptyBankLedger();

  const draft = summariseForYearEndAccounts(lines, {
    periodStart,
    periodEnd,
    customCategoryLabels,
    openingCashPence: firstYear
      ? 0
      : (comps.cashAtBankPence ?? undefined),
    retainedBroughtForwardPence: firstYear
      ? 0
      : (comps.profitAndLossReservePence ?? undefined),
    shareCapitalPence: comps.shareCapitalPence ?? undefined,
  });

  return enrichAccountsDraftFromLedger(
    draft,
    ledger,
    lines.map((l) => ({
      category: l.category,
      amountPence: l.amountPence,
      dated: l.dated,
    })),
    { shareCapitalPence: comps.shareCapitalPence ?? undefined },
  );
}

/** Re-run clustering on the client's current ledger (after imports or cleanup). */
export async function buildProvisionalHeadsForClient(clientId: string) {
  try {
    const session = await requireSession();
    if (session.role === "readonly") {
      return { ok: false as const, error: "Read-only access." };
    }
    await getClient(clientId);
    const txs = await listBankTransactions(clientId);
    if (!txs.length) {
      return { ok: false as const, error: "No bank lines to cluster." };
    }
    const { runProvisionalHeadsOnLines } = await import(
      "@/server/bank/run-provisional-heads"
    );
    const provisional = await runProvisionalHeadsOnLines(
      txs.map((t) => ({
        description: t.description,
        amountPence: t.amountPence,
        category: t.category,
        confidence: t.confidence,
      })),
      session.practiceId,
    );
    if (!provisional.created.length) {
      return {
        ok: true as const,
        created: 0,
        message:
          "No material unknown clusters found. Thresholds: £5,000 total/single line, or 10+ lines (or 3% of statement).",
      };
    }

    // Persist reassigned categories onto existing rows.
    const byIndexCategory = new Map<string, string>();
    for (let i = 0; i < txs.length; i += 1) {
      const next = provisional.lines[i];
      if (next && next.category !== txs[i].category) {
        byIndexCategory.set(txs[i].id, next.category);
      }
    }
    const groups = new Map<string, string[]>();
    for (const [id, cat] of byIndexCategory) {
      const list = groups.get(cat) ?? [];
      list.push(id);
      groups.set(cat, list);
    }
    for (const [category, ids] of groups) {
      await updateBankCategoriesBulk(ids, category);
    }

    revalidatePath(`/clients/${clientId}/bank`);
    revalidatePath(`/clients/${clientId}/accounts-pack`);
    return {
      ok: true as const,
      created: provisional.created.length,
      message: `Created ${provisional.created.length} review head${provisional.created.length === 1 ? "" : "s"}. Map each Review section to the correct accounts head.`,
    };
  } catch (err) {
    return {
      ok: false as const,
      error:
        err instanceof Error
          ? err.message
          : "Could not build provisional heads.",
    };
  }
}

/**
 * Map a provisional Review head onto a real accounts category and update
 * saved identifier rules so future statements follow.
 */
export async function mapProvisionalReviewHead(input: {
  clientId: string;
  fromCategory: string;
  toCategory: string;
}) {
  try {
    const session = await requireSession();
    if (session.role === "readonly") {
      return { ok: false as const, error: "Read-only access." };
    }
    const { isCustomCategoryId } = await import("@/lib/bank-categories");
    if (!isCustomCategoryId(input.fromCategory)) {
      return {
        ok: false as const,
        error: "Pick a Review / custom head to map.",
      };
    }
    if (!input.toCategory || input.toCategory === input.fromCategory) {
      return { ok: false as const, error: "Choose a destination accounts head." };
    }
    await getClient(input.clientId);
    const txs = await listBankTransactions(input.clientId);
    const ids = txs
      .filter((t) => t.category === input.fromCategory)
      .map((t) => t.id);
    if (ids.length) {
      await updateBankCategoriesBulk(ids, input.toCategory);
    }

    if (isDeskStoreConfigured()) {
      const { deskRetargetMerchantIdentifiers } = await import(
        "@/server/db/desk-store"
      );
      await deskRetargetMerchantIdentifiers({
        practiceId: session.practiceId,
        fromCategory: input.fromCategory,
        toCategory: input.toCategory,
      });
      const { invalidateMerchantIdentifierCache } = await import(
        "@/server/bank/merchant-identifiers"
      );
      invalidateMerchantIdentifierCache();
    }

    revalidatePath(`/clients/${input.clientId}/bank`);
    revalidatePath(`/clients/${input.clientId}/accounts-pack`);
    return {
      ok: true as const,
      moved: ids.length,
      message: `Mapped ${ids.length} line${ids.length === 1 ? "" : "s"} to the chosen head. Future matching payees will follow this rule.`,
    };
  } catch (err) {
    return {
      ok: false as const,
      error:
        err instanceof Error ? err.message : "Could not map that review head.",
    };
  }
}

const connectSchema = z.object({
  clientId: z.string().uuid().or(z.string().min(1)),
  provider: z.enum(["truelayer", "plaid", "gocardless"]).default("truelayer"),
});

/** Placeholder for Open Banking OAuth — records intent until provider keys are set */
export async function requestBankConnect(input: z.infer<typeof connectSchema>) {
  const session = await requireSession();
  const data = connectSchema.parse(input);
  await getClient(data.clientId);

  const hasKey =
    (data.provider === "truelayer" && process.env.TRUELAYER_CLIENT_ID) ||
    (data.provider === "plaid" && process.env.PLAID_CLIENT_ID) ||
    (data.provider === "gocardless" && process.env.GOCARDLESS_SECRET_ID);

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "bank.connect.requested",
    entityType: "bank_connection",
    entityId: data.clientId,
    detail: { provider: data.provider, configured: Boolean(hasKey) },
  });

  if (!hasKey) {
    return {
      ok: false as const,
      message: `Add ${data.provider.toUpperCase()} credentials to enable live Open Banking. CSV/PDF upload works today.`,
      docsPath: "/docs/bank-open-banking.md",
    };
  }

  // Live redirect URL would be built here with provider SDK
  return {
    ok: true as const,
    message: "Provider keys detected — complete OAuth in the provider dashboard integration next.",
    authorizeUrl: null as string | null,
  };
}

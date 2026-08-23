"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { isMemoryStore } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import {
  parseBankCsv,
  parseBankSpreadsheet,
  summariseForCorporationTax,
  summariseForSelfAssessment,
  type CategorisedLine,
  type BankCategory,
} from "@/server/bank/categorise";
import { summariseForYearEndAccounts } from "@/server/accounts/year-end-from-bank";
import { appendAuditEvent } from "@/server/audit/log";
import { put } from "@vercel/blob";
import { isBlobConfigured } from "@/lib/env";
import { tryGetDb } from "@/server/db";
import {
  isDeskStoreConfigured,
  deskListBankTransactions,
  deskInsertBankTransactions,
  deskUpdateBankCategory,
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
        (Number(mapped.amountPence) > 0 ? "turnover" : "admin_expenses"),
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
    }
  | { ok: false; error: string };

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

    if (
      name.endsWith(".csv") ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      file.type.includes("csv") ||
      file.type === "text/plain" ||
      file.type.includes("spreadsheet") ||
      file.type.includes("excel")
    ) {
      if (
        name.endsWith(".csv") ||
        file.type.includes("csv") ||
        file.type === "text/plain"
      ) {
        const text = await file.text();
        lines = parseBankCsv(text);
      } else {
        const buffer = await file.arrayBuffer();
        lines = parseBankSpreadsheet(buffer, file.name);
      }
    } else if (name.endsWith(".pdf") || file.type === "application/pdf") {
      // Store PDF for review; text extraction needs OCR/vendor — flag for ops
      let blobUrl = "";
      if (isBlobConfigured()) {
        const blob = await put(
          `bank-statements/${session.practiceId}/${clientId}/${Date.now()}-${file.name}`,
          file,
          { access: "public", addRandomSuffix: true },
        );
        blobUrl = blob.url;
      }
      if (isMemoryStore()) {
        memoryStore.documents.push({
          id: crypto.randomUUID(),
          clientId,
          practiceId: session.practiceId,
          filename: file.name,
          contentType: file.type || "application/pdf",
          sizeBytes: file.size,
          blobUrl: blobUrl || `pdf-pending:${file.name}`,
          category: "accounts",
          uploadedBy: session.userId,
          createdAt: new Date().toISOString(),
        });
      }
      await appendAuditEvent({
        practiceId: session.practiceId,
        clientId,
        actorId: session.userId,
        action: "bank.statement.pdf_uploaded",
        entityType: "bank_statement",
        entityId: clientId,
        detail: {
          filename: file.name,
          note: "PDF stored — use CSV for auto-categorisation, or connect Open Banking",
        },
      });
      revalidatePath(`/clients/${clientId}/bank`);
      return {
        ok: true,
        lines: [] as CategorisedLine[],
        pdfStored: true,
        message:
          "PDF stored on the client file. For automatic categorisation upload CSV, or connect Open Banking when enabled.",
      };
    } else {
      return {
        ok: false,
        error: "Upload a CSV or Excel bank export (or PDF to store for review).",
      };
    }

  if (!lines.length) {
    return {
      ok: false,
      error:
        "No transactions were found in that file. For Monzo/Starling exports, use the CSV download from your bank app.",
    };
  }

  if (isMemoryStore()) {
    for (const line of lines) {
      memoryStore.bankTransactions.push({
        id: crypto.randomUUID(),
        clientId,
        practiceId: session.practiceId,
        ...line,
        source: name.endsWith(".csv") ? "csv" : "spreadsheet",
        createdAt: new Date().toISOString(),
      });
    }
  } else if (isDeskStoreConfigured()) {
    try {
      await deskInsertBankTransactions(
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
    const chunkSize = 100;
    const mapped = lines.map((line) => ({
      practiceId: session.practiceId,
      clientId,
      dated: line.dated,
      description: line.description,
      amountPence: line.amountPence,
      category: line.category,
      confidence: line.confidence,
      source: name.endsWith(".csv") ? "csv" : "spreadsheet",
    }));
    for (let i = 0; i < mapped.length; i += chunkSize) {
      await getDb()
        .insert(bankTransactions)
        .values(mapped.slice(i, i + chunkSize));
    }
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "bank.statement.csv_imported",
    entityType: "bank_transaction",
    entityId: clientId,
    detail: { count: lines.length, filename: file.name },
  });

  revalidatePath(`/clients/${clientId}/bank`);
  revalidatePath(`/clients/${clientId}/self-assessment`);
  revalidatePath(`/clients/${clientId}/corporation-tax`);
  revalidatePath(`/clients/${clientId}/accounts-pack`);

  return {
    ok: true,
    lines,
    pdfStored: false,
    message: `Imported ${lines.length} lines`,
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
  category: BankCategory,
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

export async function getTaxDraftFromBank(clientId: string) {
  const txs = await listBankTransactions(clientId);
  const lines: CategorisedLine[] = txs.map((t) => ({
    dated: t.dated,
    description: t.description,
    amountPence: t.amountPence,
    category: t.category as BankCategory,
    confidence: (t.confidence as CategorisedLine["confidence"]) ?? "low",
  }));
  return {
    selfAssessment: summariseForSelfAssessment(lines),
    corporationTax: summariseForCorporationTax(lines),
    lineCount: lines.length,
  };
}

export async function getYearEndAccountsDraftFromBank(
  clientId: string,
  periodStart: string,
  periodEnd: string,
) {
  await getClient(clientId);
  const txs = await listBankTransactions(clientId);
  const lines: CategorisedLine[] = txs.map((t) => ({
    dated: t.dated,
    description: t.description,
    amountPence: t.amountPence,
    category: t.category as BankCategory,
    confidence: (t.confidence as CategorisedLine["confidence"]) ?? "low",
  }));
  return summariseForYearEndAccounts(lines, { periodStart, periodEnd });
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

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import { isMemoryStore } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import {
  parseBankCsv,
  summariseForCorporationTax,
  summariseForSelfAssessment,
  type CategorisedLine,
  type BankCategory,
} from "@/server/bank/categorise";
import { appendAuditEvent } from "@/server/audit/log";
import { put } from "@vercel/blob";
import { isBlobConfigured } from "@/lib/env";

export async function importBankCsv(formData: FormData) {
  const session = await requireSession();
  if (session.role === "readonly") throw new Error("Forbidden");

  const clientId = String(formData.get("clientId") ?? "");
  await getClient(clientId);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Missing statement file");

  const name = file.name.toLowerCase();
  let lines: CategorisedLine[] = [];

  if (name.endsWith(".csv") || file.type.includes("csv") || file.type === "text/plain") {
    const text = await file.text();
    lines = parseBankCsv(text);
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
      detail: { filename: file.name, note: "PDF stored — use CSV for auto-categorisation, or connect Open Banking" },
    });
    revalidatePath(`/clients/${clientId}/bank`);
    return {
      lines: [] as CategorisedLine[],
      pdfStored: true,
      message:
        "PDF stored on the client file. For automatic categorisation upload CSV, or connect Open Banking when enabled.",
    };
  } else {
    throw new Error("Upload a CSV bank export (or PDF to store for review)");
  }

  if (!lines.length) throw new Error("No transactions parsed from CSV");

  if (isMemoryStore()) {
    for (const line of lines) {
      memoryStore.bankTransactions.push({
        id: crypto.randomUUID(),
        clientId,
        practiceId: session.practiceId,
        ...line,
        source: "csv",
        createdAt: new Date().toISOString(),
      });
    }
  } else {
    const { getDb } = await import("@/server/db");
    const { bankTransactions } = await import("@/server/db/schema");
    await getDb().insert(bankTransactions).values(
      lines.map((line) => ({
        practiceId: session.practiceId,
        clientId,
        dated: line.dated,
        description: line.description,
        amountPence: line.amountPence,
        category: line.category,
        confidence: line.confidence,
        source: "csv",
      })),
    );
  }

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId,
    actorId: session.userId,
    action: "bank.statement.csv_imported",
    entityType: "bank_transaction",
    entityId: clientId,
    detail: { count: lines.length },
  });

  revalidatePath(`/clients/${clientId}/bank`);
  revalidatePath(`/clients/${clientId}/self-assessment`);
  revalidatePath(`/clients/${clientId}/corporation-tax`);

  return { lines, pdfStored: false, message: `Imported ${lines.length} lines` };
}

export async function listBankTransactions(clientId: string) {
  await getClient(clientId);
  if (isMemoryStore()) {
    return memoryStore.bankTransactions.filter((t) => t.clientId === clientId);
  }
  const { getDb } = await import("@/server/db");
  const { bankTransactions } = await import("@/server/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  return getDb()
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
  if (isMemoryStore()) {
    const row = memoryStore.bankTransactions.find((t) => t.id === transactionId);
    if (!row) throw new Error("Not found");
    row.category = category;
    row.confidence = "high";
  } else {
    const { getDb } = await import("@/server/db");
    const { bankTransactions } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(bankTransactions)
      .set({ category, confidence: "high" })
      .where(eq(bankTransactions.id, transactionId));
  }
  revalidatePath(`/clients`);
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

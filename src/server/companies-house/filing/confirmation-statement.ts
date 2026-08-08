import { randomUUID } from "crypto";
import { encryptSecret, decryptSecret } from "@/server/hmrc/crypto";
import { isMemoryStore } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import {
  csFilingInputSchema,
  type ParsedCsFilingInput,
} from "./personal-codes";
import {
  describeChFilingReadiness,
  isChXmlGatewayConfigured,
} from "./config";
import {
  buildConfirmationStatementXml,
  submitConfirmationStatementXml,
} from "./xml-gateway";
import type {
  CsFilingPublicView,
  CsFilingRecord,
  CsFilingStatus,
  CsSubmitResult,
} from "./types";

type SecretPayload = {
  companyAuthCode: string;
  directors: ParsedCsFilingInput["directors"];
};

function ensureMemoryFilings() {
  if (!Array.isArray(memoryStore.csFilings)) {
    memoryStore.csFilings = [];
  }
}

function toPublic(row: CsFilingRecord): CsFilingPublicView {
  return {
    id: row.id,
    status: row.status,
    companyNumber: row.companyNumber,
    companyName: row.companyName,
    confirmationDate: row.confirmationDate,
    clientId: row.clientId,
    practiceId: row.practiceId,
    directorNames: row.directorNames,
    lawfulPurposeConfirmed: row.lawfulPurposeConfirmed,
    registeredEmail: row.registeredEmail,
    chTransactionRef: row.chTransactionRef,
    chSubmissionNumber: row.chSubmissionNumber,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    secretsPresent: Boolean(row.encryptedSecrets),
    gatewayReady: isChXmlGatewayConfigured(),
  };
}

function encryptSecrets(input: ParsedCsFilingInput) {
  const payload: SecretPayload = {
    companyAuthCode: input.companyAuthCode,
    directors: input.directors,
  };
  return encryptSecret(JSON.stringify(payload));
}

function decryptSecrets(cipher: string): SecretPayload {
  return JSON.parse(decryptSecret(cipher)) as SecretPayload;
}

export function getCsFilingReadiness() {
  return describeChFilingReadiness();
}

export async function createCsFilingDraft(
  raw: unknown,
): Promise<CsSubmitResult> {
  const parsed = csFilingInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form";
      fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: "Check the highlighted fields before filing.",
      fieldErrors,
    };
  }

  const input = parsed.data;
  const now = new Date().toISOString();
  const id = randomUUID();
  const record: CsFilingRecord = {
    id,
    status: "validated",
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    confirmationDate: input.confirmationDate,
    clientId: input.clientId || null,
    practiceId: input.practiceId || null,
    encryptedSecrets: encryptSecrets(input),
    directorNames: input.directors.map((d) => d.fullName),
    lawfulPurposeConfirmed: input.lawfulPurposeConfirmed,
    registeredEmail: input.registeredEmail || null,
    chTransactionRef: null,
    chSubmissionNumber: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isMemoryStore()) {
    ensureMemoryFilings();
    memoryStore.csFilings.unshift(record);
  } else {
    try {
      const { getDb } = await import("@/server/db");
      const { confirmationStatementFilings } = await import(
        "@/server/db/schema"
      );
      await getDb().insert(confirmationStatementFilings).values({
        id: record.id,
        status: record.status,
        companyNumber: record.companyNumber,
        companyName: record.companyName,
        confirmationDate: record.confirmationDate,
        clientId: record.clientId,
        practiceId: record.practiceId,
        encryptedSecrets: record.encryptedSecrets,
        directorNames: record.directorNames,
        lawfulPurposeConfirmed: record.lawfulPurposeConfirmed,
        registeredEmail: record.registeredEmail,
      });
    } catch {
      return {
        ok: false,
        error:
          "Could not save filing. Run migration 20260808010000_confirmation_statement_filings.sql in Supabase.",
      };
    }
  }

  return {
    ok: true,
    filingId: id,
    status: "validated",
    mode: "queued",
    message:
      "Filing package validated. Personal codes encrypted. Ready to submit to Companies House.",
  };
}

export async function submitCsFiling(
  filingId: string,
  opts?: { dryRun?: boolean },
): Promise<CsSubmitResult> {
  const dryRun = opts?.dryRun ?? !isChXmlGatewayConfigured();
  let record: CsFilingRecord | null = null;

  if (isMemoryStore()) {
    ensureMemoryFilings();
    record = memoryStore.csFilings.find((f) => f.id === filingId) ?? null;
  } else {
    const { getDb } = await import("@/server/db");
    const { confirmationStatementFilings } = await import(
      "@/server/db/schema"
    );
    const { eq } = await import("drizzle-orm");
    const [row] = await getDb()
      .select()
      .from(confirmationStatementFilings)
      .where(eq(confirmationStatementFilings.id, filingId))
      .limit(1);
    if (row) {
      record = {
        id: row.id,
        status: row.status as CsFilingStatus,
        companyNumber: row.companyNumber,
        companyName: row.companyName,
        confirmationDate: row.confirmationDate,
        clientId: row.clientId,
        practiceId: row.practiceId,
        encryptedSecrets: row.encryptedSecrets,
        directorNames: (row.directorNames as string[]) ?? [],
        lawfulPurposeConfirmed: row.lawfulPurposeConfirmed,
        registeredEmail: row.registeredEmail,
        chTransactionRef: row.chTransactionRef,
        chSubmissionNumber: row.chSubmissionNumber,
        lastError: row.lastError,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    }
  }

  if (!record?.encryptedSecrets) {
    return { ok: false, error: "Filing not found or secrets missing." };
  }

  const secrets = decryptSecrets(record.encryptedSecrets);
  const packageInput: ParsedCsFilingInput = {
    companyNumber: record.companyNumber,
    companyName: record.companyName,
    confirmationDate: record.confirmationDate,
    companyAuthCode: secrets.companyAuthCode,
    registeredEmail: record.registeredEmail ?? "",
    lawfulPurposeConfirmed: true,
    directors: secrets.directors,
    clientId: record.clientId ?? "",
    practiceId: record.practiceId ?? "",
  };

  const xml = buildConfirmationStatementXml(packageInput);

  if (dryRun) {
    await updateFilingStatus(filingId, {
      status: "validated",
      lastError: null,
    });
    return {
      ok: true,
      filingId,
      status: "validated",
      mode: "dry_run",
      message: `XML package built (${xml.length} bytes). Add presenter credentials to submit live to Companies House.`,
    };
  }

  await updateFilingStatus(filingId, { status: "submitting", lastError: null });
  const result = await submitConfirmationStatementXml(xml);

  if (!result.ok) {
    await updateFilingStatus(filingId, {
      status: "failed",
      lastError: result.error ?? "Submit failed",
    });
    return { ok: false, error: result.error ?? "Submit failed" };
  }

  await updateFilingStatus(filingId, {
    status: "submitted",
    chSubmissionNumber: result.submissionNumber ?? null,
    lastError: null,
  });

  return {
    ok: true,
    filingId,
    status: "submitted",
    mode: "xml_gateway",
    message: "Confirmation statement submitted to Companies House.",
    submissionNumber: result.submissionNumber,
  };
}

async function updateFilingStatus(
  id: string,
  patch: Partial<
    Pick<
      CsFilingRecord,
      "status" | "lastError" | "chSubmissionNumber" | "chTransactionRef"
    >
  >,
) {
  const now = new Date().toISOString();
  if (isMemoryStore()) {
    ensureMemoryFilings();
    const row = memoryStore.csFilings.find((f) => f.id === id);
    if (!row) return;
    Object.assign(row, patch, { updatedAt: now });
    return;
  }
  const { getDb } = await import("@/server/db");
  const { confirmationStatementFilings } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDb()
    .update(confirmationStatementFilings)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(confirmationStatementFilings.id, id));
}

export async function getCsFiling(
  filingId: string,
): Promise<CsFilingPublicView | null> {
  if (isMemoryStore()) {
    ensureMemoryFilings();
    const row = memoryStore.csFilings.find((f) => f.id === filingId);
    return row ? toPublic(row) : null;
  }
  const { getDb } = await import("@/server/db");
  const { confirmationStatementFilings } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await getDb()
    .select()
    .from(confirmationStatementFilings)
    .where(eq(confirmationStatementFilings.id, filingId))
    .limit(1);
  if (!row) return null;
  return toPublic({
    id: row.id,
    status: row.status as CsFilingStatus,
    companyNumber: row.companyNumber,
    companyName: row.companyName,
    confirmationDate: row.confirmationDate,
    clientId: row.clientId,
    practiceId: row.practiceId,
    encryptedSecrets: row.encryptedSecrets,
    directorNames: (row.directorNames as string[]) ?? [],
    lawfulPurposeConfirmed: row.lawfulPurposeConfirmed,
    registeredEmail: row.registeredEmail,
    chTransactionRef: row.chTransactionRef,
    chSubmissionNumber: row.chSubmissionNumber,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

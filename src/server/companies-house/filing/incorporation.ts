import { randomUUID } from "crypto";
import { encryptSecret, decryptSecret } from "@/server/hmrc/crypto";
import { isMemoryStore } from "@/lib/env";
import { memoryStore } from "@/server/demo/store";
import {
  incorporationInputSchema,
  type ParsedIncorporationInput,
} from "./incorporation-schema";
import {
  describeChFilingReadiness,
  isChXmlGatewayConfigured,
  getChFilingEnv,
} from "./config";
import { buildCompanyIncorporationXml } from "./incorporation-xml";
import { submitCompanyIncorporationXml } from "./xml-gateway";
import type {
  In01FilingPublicView,
  In01FilingRecord,
  In01FilingStatus,
  In01SubmitResult,
} from "./types";

function ensureMemoryFilings() {
  if (!Array.isArray(memoryStore.in01Filings)) {
    memoryStore.in01Filings = [];
  }
}

function toPublic(row: In01FilingRecord): In01FilingPublicView {
  return {
    id: row.id,
    status: row.status,
    companyName: row.companyName,
    sameDay: row.sameDay,
    registeredEmail: row.registeredEmail,
    directorNames: row.directorNames,
    sicCodes: row.sicCodes,
    practiceId: row.practiceId,
    clientId: row.clientId,
    chTransactionRef: row.chTransactionRef,
    chSubmissionNumber: row.chSubmissionNumber,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    secretsPresent: Boolean(row.encryptedSecrets),
    gatewayReady: isChXmlGatewayConfigured(),
  };
}

function encryptPackage(input: ParsedIncorporationInput) {
  return encryptSecret(JSON.stringify(input));
}

function decryptPackage(cipher: string): ParsedIncorporationInput {
  return JSON.parse(decryptSecret(cipher)) as ParsedIncorporationInput;
}

export function getIncorporationFilingReadiness() {
  return describeChFilingReadiness();
}

export async function createIncorporationDraft(
  raw: unknown,
): Promise<In01SubmitResult> {
  const parsed = incorporationInputSchema.safeParse(raw);
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
  const built = buildCompanyIncorporationXml(input);
  const now = new Date().toISOString();
  const id = randomUUID();
  const record: In01FilingRecord = {
    id,
    status: "validated",
    companyName: input.companyName,
    sameDay: input.sameDay,
    registeredEmail: input.registeredEmail,
    directorNames: input.directors.map((d) => `${d.forename} ${d.surname}`),
    sicCodes: input.sicCodes,
    practiceId: input.practiceId || null,
    clientId: input.clientId || null,
    encryptedSecrets: encryptPackage(input),
    chTransactionRef: null,
    chSubmissionNumber: built.submissionNumber,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  if (isMemoryStore()) {
    ensureMemoryFilings();
    memoryStore.in01Filings.unshift(record);
  } else {
    // Persist alongside CS01 memory path until a dedicated table ships.
    ensureMemoryFilings();
    memoryStore.in01Filings.unshift(record);
  }

  return {
    ok: true,
    filingId: id,
    status: "validated",
    mode: "queued",
    message:
      "Incorporation package validated. Personal codes encrypted. Ready to submit or pay.",
    submissionNumber: built.submissionNumber,
    xmlBytes: built.xml.length,
  };
}

export async function submitIncorporationFiling(
  filingId: string,
  opts?: { dryRun?: boolean },
): Promise<In01SubmitResult> {
  const cfg = getChFilingEnv();
  const dryRun = opts?.dryRun ?? !isChXmlGatewayConfigured();

  ensureMemoryFilings();
  const record =
    memoryStore.in01Filings.find((f) => f.id === filingId) ?? null;

  if (!record?.encryptedSecrets) {
    return { ok: false, error: "Filing not found or secrets missing." };
  }

  const input = decryptPackage(record.encryptedSecrets);
  const built = buildCompanyIncorporationXml(input);

  if (dryRun) {
    await updateFilingStatus(filingId, {
      status: "validated",
      lastError: null,
      chSubmissionNumber: built.submissionNumber,
    });
    return {
      ok: true,
      filingId,
      status: "validated",
      mode: "dry_run",
      message: `XML package built (${built.xml.length} bytes)${
        cfg.packageReference ? "" : ". Set COMPANIES_HOUSE_PACKAGE_REFERENCE for live."
      }.`,
      submissionNumber: built.submissionNumber,
      xmlBytes: built.xml.length,
    };
  }

  if (!cfg.packageReference) {
    return {
      ok: false,
      error:
        "Set COMPANIES_HOUSE_PACKAGE_REFERENCE (issued with your presenter account) before live IN01 submit.",
    };
  }

  await updateFilingStatus(filingId, { status: "submitting", lastError: null });
  const result = await submitCompanyIncorporationXml(built.xml);

  if (!result.ok) {
    await updateFilingStatus(filingId, {
      status: "failed",
      lastError: result.error ?? "Submit failed",
    });
    return { ok: false, error: result.error ?? "Submit failed" };
  }

  await updateFilingStatus(filingId, {
    status: "submitted",
    chSubmissionNumber: result.submissionNumber ?? built.submissionNumber,
    lastError: null,
  });

  return {
    ok: true,
    filingId,
    status: "submitted",
    mode: "xml_gateway",
    message: "Incorporation submitted to Companies House.",
    submissionNumber: result.submissionNumber ?? built.submissionNumber,
  };
}

async function updateFilingStatus(
  id: string,
  patch: Partial<
    Pick<
      In01FilingRecord,
      "status" | "lastError" | "chSubmissionNumber" | "chTransactionRef"
    >
  >,
) {
  const now = new Date().toISOString();
  ensureMemoryFilings();
  const row = memoryStore.in01Filings.find((f) => f.id === id);
  if (!row) return;
  Object.assign(row, patch, { updatedAt: now });
}

export async function getIncorporationFiling(
  filingId: string,
): Promise<In01FilingPublicView | null> {
  ensureMemoryFilings();
  const row = memoryStore.in01Filings.find((f) => f.id === filingId);
  return row ? toPublic(row) : null;
}

export type { In01FilingStatus };

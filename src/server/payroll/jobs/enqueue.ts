/**
 * Enqueue a bureau employee CSV pack (zip bytes or file map).
 * Server-only — call from internal API / scripts, not desk UI.
 */

import {
  parsePackFromFileMap,
  parsePackFromZip,
  type PackCompanyItem,
} from "./pack-manifest";
import { enqueueBulkImportJob } from "./store";
import { BULK_IMPORT_MAX_COMPANIES } from "./constants";

export type EnqueueBulkImportInput = {
  practiceId: string;
  createdBy?: string | null;
  sourceLabel?: string | null;
  artifactKey?: string | null;
  /** Raw zip bytes (preferred for bureau packs). */
  zipBytes?: Buffer | Uint8Array | null;
  /** Already-unzipped path → CSV text (or manifest.json + paths). */
  files?: Map<string, string> | Record<string, string> | null;
  /** Pre-parsed items (tests / advanced callers). */
  items?: PackCompanyItem[] | null;
};

export type EnqueueBulkImportResult =
  | {
      ok: true;
      jobId: string;
      itemCount: number;
      parseErrors: string[];
    }
  | {
      ok: false;
      error: string;
      parseErrors: string[];
    };

export async function enqueueBulkEmployeeCsvPack(
  input: EnqueueBulkImportInput,
): Promise<EnqueueBulkImportResult> {
  const practiceId = String(input.practiceId || "").trim();
  if (!practiceId) {
    return { ok: false, error: "practiceId required", parseErrors: [] };
  }

  let items: PackCompanyItem[] = [];
  let parseErrors: string[] = [];

  if (input.items?.length) {
    items = input.items;
  } else if (input.zipBytes && (input.zipBytes as Uint8Array).byteLength > 0) {
    const parsed = parsePackFromZip(input.zipBytes);
    items = parsed.items;
    parseErrors = parsed.errors;
  } else if (input.files) {
    const parsed = parsePackFromFileMap(input.files);
    items = parsed.items;
    parseErrors = parsed.errors;
  } else {
    return {
      ok: false,
      error: "Provide zipBytes, files map, or items",
      parseErrors: [],
    };
  }

  if (!items.length) {
    return {
      ok: false,
      error: "No company CSVs found in pack",
      parseErrors,
    };
  }
  if (items.length > BULK_IMPORT_MAX_COMPANIES) {
    return {
      ok: false,
      error: `Too many companies (max ${BULK_IMPORT_MAX_COMPANIES})`,
      parseErrors,
    };
  }

  const { jobId, itemCount } = await enqueueBulkImportJob({
    practiceId,
    createdBy: input.createdBy,
    sourceLabel: input.sourceLabel,
    artifactKey: input.artifactKey,
    items,
    meta: { parseErrorCount: parseErrors.length },
  });

  return { ok: true, jobId, itemCount, parseErrors };
}

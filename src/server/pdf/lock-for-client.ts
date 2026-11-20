import { getClient } from "@/server/actions/clients";
import {
  lockPdfWithPassword,
  pickDirectorDob,
  type LockedPdf,
} from "@/server/pdf/dob-lock";
import type { DocumentPasswordSection } from "@/lib/document-password-policy";
import { resolveDocumentPassword } from "@/lib/document-password-policy";
import { getDocumentPasswordPolicy } from "@/server/actions/document-password-policy";

/**
 * Resolve the signing director DOB used as a fallback / SA password source.
 * Prefers SA taxpayers marked director, then any taxpayer DOB on file.
 */
export async function resolveDirectorDobForClient(
  clientId: string,
): Promise<string | null> {
  const client = await getClient(clientId);
  const taxpayers =
    (
      client.deskProfile as {
        saTaxpayers?: Array<{ role?: string; dateOfBirth?: string }>;
      } | null
    )?.saTaxpayers ?? [];
  const directors = taxpayers.filter((t) =>
    String(t.role ?? "").toLowerCase().includes("director"),
  );
  return pickDirectorDob([
    ...directors.map((t) => t.dateOfBirth),
    ...taxpayers.map((t) => t.dateOfBirth),
  ]);
}

async function buildPasswordContext(
  clientId: string,
  dateOfBirth?: string | null,
  personalUtr?: string | null,
) {
  const client = await getClient(clientId);
  const directorDob =
    pickDirectorDob([dateOfBirth]) ??
    (await resolveDirectorDobForClient(clientId));

  const isLtd = client.type === "limited_company";
  return {
    companyUtr: isLtd ? client.utr : null,
    personalUtr:
      personalUtr?.trim() ||
      (!isLtd ? client.utr : null) ||
      null,
    nino: client.nino,
    companyNumber: client.companyNumber,
    dateOfBirth: directorDob,
    payeRef: client.payeRef ?? null,
    accountsOfficeRef: client.accountsOfficeRef ?? null,
  };
}

/** Lock a generated PDF using the practice password-protection policy. */
export async function protectClientPdf(input: {
  clientId: string;
  pdfBytes: Uint8Array | Buffer;
  pdfFilename: string;
  /** Which desk section — drives which identifier the practice chose. */
  section?: DocumentPasswordSection;
  /** Prefer this DOB (e.g. SA100 taxpayer) before looking up directors */
  dateOfBirth?: string | null;
  /** Prefer this personal UTR when policy uses personal_utr */
  personalUtr?: string | null;
  /** Force lock — throws if identifier value missing */
  requireLock?: boolean;
}): Promise<
  | { locked: true; pack: LockedPdf }
  | {
      locked: false;
      bytes: Buffer;
      filename: string;
      contentType: "application/pdf";
    }
> {
  const section = input.section ?? "sa";
  const policy = await getDocumentPasswordPolicy();
  const identifier = policy[section];
  const ctx = await buildPasswordContext(
    input.clientId,
    input.dateOfBirth,
    input.personalUtr,
  );
  const resolved = resolveDocumentPassword(identifier, ctx);

  if (!resolved.locked) {
    if (input.requireLock && identifier !== "none") {
      // Desk UI never surfaces this — send unlocked and log for the builder.
      console.error(
        "[pdf] password lock skipped; identifier missing for section",
        { clientId: input.clientId, section, identifier },
      );
    }
    return {
      locked: false,
      bytes: Buffer.from(input.pdfBytes),
      filename: input.pdfFilename,
      contentType: "application/pdf",
    };
  }

  const pack = await lockPdfWithPassword({
    pdfBytes: input.pdfBytes,
    pdfFilename: input.pdfFilename,
    password: resolved.password,
    passwordHint: `Password: ${resolved.hint}`,
  });
  return { locked: true, pack };
}

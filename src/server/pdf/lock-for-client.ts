import { getClient } from "@/server/actions/clients";
import {
  lockPdfWithDobPassword,
  pickDirectorDob,
  type LockedPdf,
} from "@/server/pdf/dob-lock";

/**
 * Resolve the signing director DOB used as the PDF pack password.
 * Prefers SA taxpayers marked director, then any taxpayer DOB on file.
 */
export async function resolveDirectorDobForClient(
  clientId: string,
): Promise<string | null> {
  const client = await getClient(clientId);
  const taxpayers =
    (client.deskProfile as { saTaxpayers?: Array<{ role?: string; dateOfBirth?: string }> } | null)
      ?.saTaxpayers ?? [];
  const directors = taxpayers.filter((t) =>
    String(t.role ?? "").toLowerCase().includes("director"),
  );
  return pickDirectorDob([
    ...directors.map((t) => t.dateOfBirth),
    ...taxpayers.map((t) => t.dateOfBirth),
  ]);
}

/** Lock a generated PDF when a director DOB is on file; otherwise return raw PDF. */
export async function protectClientPdf(input: {
  clientId: string;
  pdfBytes: Uint8Array | Buffer;
  pdfFilename: string;
  /** Prefer this DOB (e.g. SA100 taxpayer) before looking up directors */
  dateOfBirth?: string | null;
  /** Force lock — throws if DOB missing */
  requireLock?: boolean;
}): Promise<
  | { locked: true; pack: LockedPdf }
  | { locked: false; bytes: Buffer; filename: string; contentType: "application/pdf" }
> {
  const dob =
    pickDirectorDob([input.dateOfBirth]) ??
    (await resolveDirectorDobForClient(input.clientId));
  if (!dob) {
    if (input.requireLock) {
      throw new Error(
        "Add the signing director’s date of birth on the Self Assessment person card to lock this PDF.",
      );
    }
    return {
      locked: false,
      bytes: Buffer.from(input.pdfBytes),
      filename: input.pdfFilename,
      contentType: "application/pdf",
    };
  }
  const pack = lockPdfWithDobPassword({
    pdfBytes: input.pdfBytes,
    pdfFilename: input.pdfFilename,
    dateOfBirth: dob,
  });
  return { locked: true, pack };
}

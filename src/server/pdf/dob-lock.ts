import { createPasswordProtectedZip } from "@/server/payroll/zip-crypto";

/**
 * PDF lock for client packs — Acrobat/Windows open the zip with the
 * director’s date of birth as DDMMYYYY (8 characters).
 *
 * pdf-lib cannot encrypt PDFs; ZipCrypto matches the payroll pack pattern
 * and works in Explorer / Preview / Acrobat when the zip is opened.
 */

export type LockedPdf = {
  bytes: Buffer;
  /** Always ZipCrypto archive */
  contentType: "application/zip";
  /** e.g. SA800-2025-26.pdf.zip */
  filename: string;
  password: string;
  passwordHint: string;
};

/** Normalise DOB to Digits-only DDMMYYYY for the pack password. */
export function dobToPdfPassword(dob: string): string | null {
  const iso = dob.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  const digits = iso.replace(/\D/g, "");
  if (digits.length === 8) {
    // Accept DDMMYYYY or YYYYMMDD — prefer DDMMYYYY when day>12 ambiguous
    const asDmy = digits;
    const y = Number(asDmy.slice(4, 8));
    if (y >= 1900 && y <= 2100) return asDmy;
    // YYYYMMDD
    return `${digits.slice(6, 8)}${digits.slice(4, 6)}${digits.slice(0, 4)}`;
  }
  return null;
}

export function lockPdfWithDobPassword(input: {
  pdfBytes: Uint8Array | Buffer;
  pdfFilename: string;
  dateOfBirth: string;
}): LockedPdf {
  const password = dobToPdfPassword(input.dateOfBirth);
  if (!password || password.length < 8) {
    throw new Error(
      "Director date of birth is required to lock this PDF (use DD/MM/YYYY).",
    );
  }
  const base = input.pdfFilename.replace(/\.zip$/i, "");
  const pdfName = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  const bytes = createPasswordProtectedZip(
    [{ name: pdfName, data: Buffer.from(input.pdfBytes) }],
    password,
  );
  return {
    bytes,
    contentType: "application/zip",
    filename: `${pdfName}.zip`,
    password,
    passwordHint:
      "Password is the signing director’s date of birth as DDMMYYYY (eight digits, no slashes).",
  };
}

/** Pick a director DOB from SA taxpayers or explicit override. */
export function pickDirectorDob(candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (!c?.trim()) continue;
    const pw = dobToPdfPassword(c);
    if (pw) return c.trim();
  }
  return null;
}

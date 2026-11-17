import { encryptPDF, AlreadyEncryptedError } from "@pdfsmaller/pdf-encrypt";

/**
 * PDF lock for client packs — Acrobat / Preview open the PDF with the
 * practice password (often DOB as DDMMYYYY).
 *
 * Uses real PDF encryption (AES-256). Previously we wrapped PDFs in a
 * ZipCrypto .zip because pdf-lib cannot encrypt; that is no longer used here.
 */

export type LockedPdf = {
  bytes: Buffer;
  contentType: "application/pdf";
  /** e.g. SA100-2025-26.pdf */
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

export async function lockPdfWithPassword(input: {
  pdfBytes: Uint8Array | Buffer;
  pdfFilename: string;
  password: string;
  passwordHint: string;
}): Promise<LockedPdf> {
  const password = input.password.trim();
  if (password.length < 6) {
    throw new Error("Document password is too short to lock this PDF.");
  }
  const base = input.pdfFilename.replace(/\.zip$/i, "");
  const pdfName = base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
  const source = new Uint8Array(input.pdfBytes);

  let encrypted: Uint8Array;
  try {
    encrypted = await encryptPDF(source, password, {
      algorithm: "AES-256",
      allowPrinting: true,
      allowCopying: false,
      allowModifying: false,
      allowAnnotating: false,
      allowFillingForms: false,
      allowHighQualityPrint: true,
    });
  } catch (err) {
    if (err instanceof AlreadyEncryptedError) {
      // Uploaded pack already locked — send as-is rather than failing the email.
      encrypted = source;
    } else {
      throw err;
    }
  }

  return {
    bytes: Buffer.from(encrypted),
    contentType: "application/pdf",
    filename: pdfName.replace(/\.zip$/i, ""),
    password,
    passwordHint: input.passwordHint,
  };
}

export async function lockPdfWithDobPassword(input: {
  pdfBytes: Uint8Array | Buffer;
  pdfFilename: string;
  dateOfBirth: string;
}): Promise<LockedPdf> {
  const password = dobToPdfPassword(input.dateOfBirth);
  if (!password || password.length < 8) {
    throw new Error(
      "Director date of birth is required to lock this PDF (use DD/MM/YYYY).",
    );
  }
  return lockPdfWithPassword({
    pdfBytes: input.pdfBytes,
    pdfFilename: input.pdfFilename,
    password,
    passwordHint:
      "Password is the signing director’s date of birth as DDMMYYYY (eight digits, no slashes).",
  });
}

/** Pick a director DOB from SA taxpayers or explicit override. */
export function pickDirectorDob(
  candidates: Array<string | null | undefined>,
): string | null {
  for (const c of candidates) {
    if (!c?.trim()) continue;
    const pw = dobToPdfPassword(c);
    if (pw) return c.trim();
  }
  return null;
}

/**
 * Column-level encryption helper for high-sensitivity identifiers
 * (NINO, UTR, bank account numbers, dates of birth) — UK GDPR Art 32(1)(a).
 *
 * STATUS: exported and tested but NOT wired into any read/write path.
 * Wiring it requires a data migration and replacing every code path that
 * searches / matches on these columns in plaintext (client search, SA person
 * matching, HMRC calls, CSV import). See docs/security/ropa.md "Encryption".
 *
 * Design:
 *   - Reuses `encryptSecret` / `decryptSecret` (AES-256-GCM, TOKEN_ENCRYPTION_KEY).
 *   - Stored form is `enc:v1:<base64>`; the prefix makes it BACKWARD
 *     COMPATIBLE — legacy plaintext values are returned unchanged by
 *     `decryptField`, so reads work before, during and after a backfill.
 *   - `blindIndex` gives a keyed, deterministic HMAC so equality lookups
 *     (e.g. "find client by UTR") remain possible without storing plaintext.
 */

import { createHmac } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/server/hmrc/crypto";

export const FIELD_PREFIX = "enc:v1:";

export function isEncryptedField(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(FIELD_PREFIX);
}

export function encryptField(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (isEncryptedField(value)) return value; // idempotent
  return `${FIELD_PREFIX}${encryptSecret(value)}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (!isEncryptedField(value)) return value; // legacy plaintext
  return decryptSecret(value.slice(FIELD_PREFIX.length));
}

/**
 * Keyed hash for equality search on an encrypted column. Normalises case and
 * whitespace first. Requires a dedicated secret (never TOKEN_ENCRYPTION_KEY).
 */
export function blindIndex(
  value: string,
  secret = process.env.FIELD_INDEX_KEY ?? "",
): string {
  if (!secret) {
    throw new Error("FIELD_INDEX_KEY is not set; cannot build a blind index.");
  }
  const normalised = value.replace(/\s+/g, "").toUpperCase();
  return createHmac("sha256", secret).update(normalised).digest("hex");
}

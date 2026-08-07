import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getEnv } from "@/lib/env";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = getEnv().TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    // Deterministic demo key — replace in production
    return createHash("sha256").update("hydratax-demo-token-key").digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    return createHash("sha256").update(raw).digest();
  }
  return buf;
}

/** AES-256-GCM encrypt plaintext → base64(iv|tag|ciphertext) */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

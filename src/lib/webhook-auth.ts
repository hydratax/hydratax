import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison. Both inputs are hashed first so the
 * comparison is fixed-length (no length oracle) and uses timingSafeEqual.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/**
 * True when `authorization` is exactly `Bearer <secret>`. Fails closed when the
 * secret is unset/empty.
 */
export function bearerMatches(
  authorization: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;
  const header = authorization ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  return safeEqual(m[1]!.trim(), secret);
}

export type SecretAuth =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Authorise a request with `Authorization: Bearer <secret>` only (never query
 * strings, which leak into logs). 503 when the secret is not configured.
 */
export function authorizeBearer(
  req: { headers: { get(name: string): string | null } },
  secret: string | undefined,
  label = "Endpoint",
): SecretAuth {
  if (!secret) {
    return { ok: false, status: 503, error: `${label} secret is not configured` };
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

/** Verify `X-Hub-Signature-256: sha256=<hex>` (Meta / WhatsApp Cloud API). */
export function verifyMetaSignature(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret: string | null | undefined,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(signatureHeader.trim());
  if (!m) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const given = Buffer.from(m[1]!, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Verify a Svix-signed webhook (used by Resend). Spec:
 * signed content = `${svix-id}.${svix-timestamp}.${rawBody}`,
 * key = base64-decoded part of `whsec_...`, signature = base64(HMAC-SHA256),
 * header `svix-signature` = space separated `v1,<sig>` entries.
 */
export function verifySvixSignature(input: {
  secret: string | null | undefined;
  id: string | null | undefined;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  rawBody: string;
  /** Seconds either side of now. Default 5 minutes (Svix default). */
  toleranceSec?: number;
  nowMs?: number;
}): boolean {
  const { secret, id, timestamp, signature, rawBody } = input;
  if (!secret || !id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || !/^\d+$/.test(timestamp)) return false;
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > (input.toleranceSec ?? 300)) return false;

  const keyPart = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(keyPart, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest();

  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    let given: Buffer;
    try {
      given = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) {
      return true;
    }
  }
  return false;
}

/** Test helper / signer matching `verifySvixSignature`. */
export function signSvix(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string,
): string {
  const keyPart = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const sig = createHmac("sha256", Buffer.from(keyPart, "base64"))
    .update(`${id}.${timestamp}.${rawBody}`, "utf8")
    .digest("base64");
  return `v1,${sig}`;
}

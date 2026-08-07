import { z } from "zod";
import { getHmrcConfig } from "./config";
import type { ClientFraudMetadata } from "@/lib/fraud-types";

export type { ClientFraudMetadata };

/**
 * Browser-collected fraud prevention metadata — must be captured at request
 * time and never cached across submissions.
 */
export const clientFraudMetadataSchema = z.object({
  browserJsUserAgent: z.string().min(1),
  timezone: z.string().min(1),
  screens: z.string().min(1),
  windowSize: z.string().min(1),
  localIps: z.string().min(1),
  localIpsTimestamp: z.string().min(1),
  deviceId: z.string().optional(),
});

export type FraudHeaderMap = Record<string, string>;

export class IncompleteFraudHeadersError extends Error {
  constructor(public missing: string[]) {
    super(
      `Blocked HMRC request: incomplete fraud prevention headers: ${missing.join(", ")}`,
    );
    this.name = "IncompleteFraudHeadersError";
  }
}

const REQUIRED_KEYS = [
  "Gov-Client-Connection-Method",
  "Gov-Client-Browser-JS-User-Agent",
  "Gov-Client-Timezone",
  "Gov-Client-Screens",
  "Gov-Client-Window-Size",
  "Gov-Client-Local-IPs",
  "Gov-Client-Local-IPs-Timestamp",
  "Gov-Vendor-Version",
  "Gov-Vendor-License-IDs",
  "Gov-Vendor-Public-IP",
] as const;

export function buildFraudPreventionHeaders(
  meta: ClientFraudMetadata,
  opts?: { clientPublicIp?: string; vendorForwarded?: string },
): FraudHeaderMap {
  const parsed = clientFraudMetadataSchema.safeParse(meta);
  if (!parsed.success) {
    throw new IncompleteFraudHeadersError(
      parsed.error.issues.map((i) => i.path.join(".")),
    );
  }

  const cfg = getHmrcConfig();
  const m = parsed.data;

  const headers: FraudHeaderMap = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": encodeURIComponent(m.browserJsUserAgent),
    "Gov-Client-Timezone": m.timezone,
    "Gov-Client-Screens": m.screens,
    "Gov-Client-Window-Size": m.windowSize,
    "Gov-Client-Local-IPs": encodeURIComponent(m.localIps),
    "Gov-Client-Local-IPs-Timestamp": m.localIpsTimestamp,
    "Gov-Vendor-Version": encodeURIComponent(cfg.vendorVersion),
    "Gov-Vendor-License-IDs": encodeURIComponent(cfg.vendorLicenseIds),
    "Gov-Vendor-Public-IP": cfg.vendorPublicIp,
  };

  if (opts?.clientPublicIp) {
    headers["Gov-Client-Public-IP"] = opts.clientPublicIp;
    headers["Gov-Client-Public-IP-Timestamp"] = new Date().toISOString();
  }
  if (m.deviceId) {
    headers["Gov-Client-Device-ID"] = m.deviceId;
  }
  if (opts?.vendorForwarded) {
    headers["Gov-Vendor-Forwarded"] = opts.vendorForwarded;
  }

  assertCompleteFraudHeaders(headers);
  return headers;
}

export function assertCompleteFraudHeaders(headers: FraudHeaderMap): void {
  const missing = REQUIRED_KEYS.filter(
    (k) => !headers[k] || headers[k].trim() === "",
  );
  if (missing.length > 0) {
    throw new IncompleteFraudHeadersError([...missing]);
  }
}


import { z } from "zod";
import { getHmrcConfig } from "./config";
import type { ClientFraudMetadata } from "@/lib/fraud-types";

export type { ClientFraudMetadata };

/**
 * Browser-collected fraud prevention metadata — must be captured at request
 * time and never cached across submissions.
 *
 * Connection method: WEB_APP_VIA_SERVER (HMRC fraud-prevention spec).
 */
export const clientFraudMetadataSchema = z.object({
  browserJsUserAgent: z.string().min(1),
  timezone: z.string().min(1),
  screens: z.string().min(1),
  windowSize: z.string().min(1),
  localIps: z.string().min(1),
  localIpsTimestamp: z.string().min(1),
  deviceId: z.string().min(1),
  doNotTrack: z.string().min(1),
  browserPlugins: z.string(),
  userIds: z.string().min(1),
  multiFactor: z.string(),
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

/** Keys HMRC expects for WEB_APP_VIA_SERVER (presence; format validated separately). */
const REQUIRED_KEYS = [
  "Gov-Client-Connection-Method",
  "Gov-Client-Device-ID",
  "Gov-Client-User-IDs",
  "Gov-Client-Timezone",
  "Gov-Client-Local-IPs",
  "Gov-Client-Local-IPs-Timestamp",
  "Gov-Client-Screens",
  "Gov-Client-Window-Size",
  "Gov-Client-Browser-JS-User-Agent",
  "Gov-Client-Browser-Do-Not-Track",
  "Gov-Vendor-Version",
  "Gov-Vendor-Product-Name",
  "Gov-Vendor-License-IDs",
  "Gov-Vendor-Public-IP",
] as const;

function isPublicIp(ip: string): boolean {
  const v = ip.trim();
  if (!v || v === "unknown" || v === "0.0.0.0" || v === "::") return false;
  if (v.startsWith("10.") || v.startsWith("127.") || v.startsWith("192.168.")) {
    return false;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v)) return false;
  return true;
}

export function buildFraudPreventionHeaders(
  meta: ClientFraudMetadata,
  opts?: {
    clientPublicIp?: string;
    clientPublicPort?: string;
    vendorForwarded?: string;
    multiFactor?: string;
  },
): FraudHeaderMap {
  const parsed = clientFraudMetadataSchema.safeParse(meta);
  if (!parsed.success) {
    throw new IncompleteFraudHeadersError(
      parsed.error.issues.map((i) => i.path.join(".")),
    );
  }

  const cfg = getHmrcConfig();
  const m = parsed.data;

  const vendorVersion = cfg.vendorVersion.includes("=")
    ? cfg.vendorVersion
    : `HydraTax=${cfg.vendorVersion}`;
  const licenseIds = cfg.vendorLicenseIds.includes("=")
    ? cfg.vendorLicenseIds
    : `HydraTax=${cfg.vendorLicenseIds}`;

  const headers: FraudHeaderMap = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Device-ID": m.deviceId,
    "Gov-Client-User-IDs": m.userIds,
    "Gov-Client-Timezone": m.timezone,
    "Gov-Client-Local-IPs": m.localIps,
    "Gov-Client-Local-IPs-Timestamp": m.localIpsTimestamp,
    "Gov-Client-Screens": m.screens,
    "Gov-Client-Window-Size": m.windowSize,
    "Gov-Client-Browser-JS-User-Agent": encodeURIComponent(m.browserJsUserAgent),
    "Gov-Client-Browser-Do-Not-Track": m.doNotTrack,
    "Gov-Client-Browser-Plugins": m.browserPlugins || "",
    "Gov-Client-Multi-Factor": opts?.multiFactor ?? m.multiFactor ?? "",
    "Gov-Vendor-Version": encodeURIComponent(vendorVersion),
    "Gov-Vendor-Product-Name": encodeURIComponent("HydraTax"),
    "Gov-Vendor-License-IDs": encodeURIComponent(licenseIds),
    "Gov-Vendor-Public-IP": cfg.vendorPublicIp,
  };

  if (opts?.clientPublicIp && isPublicIp(opts.clientPublicIp)) {
    headers["Gov-Client-Public-IP"] = opts.clientPublicIp;
    headers["Gov-Client-Public-IP-Timestamp"] = new Date().toISOString();
    if (opts.clientPublicPort) {
      headers["Gov-Client-Public-Port"] = opts.clientPublicPort;
    }
    const vendorIp = cfg.vendorPublicIp;
    // Prefer an explicit override; otherwise emit Forwarded when we have a
    // usable vendor public IP (required in production WEB_APP_VIA_SERVER).
    if (opts.vendorForwarded) {
      headers["Gov-Vendor-Forwarded"] = opts.vendorForwarded;
    } else if (isPublicIp(vendorIp)) {
      headers["Gov-Vendor-Forwarded"] =
        `by=${encodeURIComponent(vendorIp)}&for=${encodeURIComponent(opts.clientPublicIp)}`;
    }
  }

  assertCompleteFraudHeaders(headers);
  return headers;
}

/** Production WEB_APP_VIA_SERVER also requires the client public IP chain. */
const PRODUCTION_REQUIRED_KEYS = [
  "Gov-Client-Public-IP",
  "Gov-Client-Public-IP-Timestamp",
  "Gov-Vendor-Forwarded",
] as const;

export function assertCompleteFraudHeaders(headers: FraudHeaderMap): void {
  const missing = REQUIRED_KEYS.filter(
    (k) => headers[k] === undefined || headers[k].trim() === "",
  );
  if (missing.length > 0) {
    throw new IncompleteFraudHeadersError([...missing]);
  }
  const cfg = getHmrcConfig();
  if (
    cfg.env === "production" &&
    (headers["Gov-Vendor-Public-IP"] === "0.0.0.0" ||
      headers["Gov-Vendor-Public-IP"] === "::")
  ) {
    throw new IncompleteFraudHeadersError(["Gov-Vendor-Public-IP"]);
  }
  if (cfg.env === "production") {
    const prodMissing = PRODUCTION_REQUIRED_KEYS.filter(
      (k) => headers[k] === undefined || headers[k].trim() === "",
    );
    if (prodMissing.length > 0) {
      throw new IncompleteFraudHeadersError([...prodMissing]);
    }
  }
}

/** Resolve client public IP/port for fraud headers inside a Server Action. */
export async function fraudOptsFromRequest(): Promise<{
  clientPublicIp?: string;
  clientPublicPort?: string;
}> {
  const { getClientIp, getClientPublicPort } = await import("@/lib/rate-limit");
  const clientPublicIp = await getClientIp();
  const clientPublicPort = await getClientPublicPort();
  return {
    clientPublicIp:
      clientPublicIp !== "unknown" ? clientPublicIp : undefined,
    clientPublicPort,
  };
}

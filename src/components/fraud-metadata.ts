"use client";

import {
  collectClientFraudMetadata,
  warmFraudLocalIps,
} from "@/lib/fraud-metadata-client";

export function gatherFraudMetadata(opts?: { userId?: string }) {
  return collectClientFraudMetadata(opts);
}

/** Call once on HMRC filing desks to refresh LAN IPs for fraud headers. */
export function warmFraudHeaders() {
  warmFraudLocalIps();
}

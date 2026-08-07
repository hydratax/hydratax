"use client";

import { collectClientFraudMetadata } from "@/lib/fraud-metadata-client";

export function gatherFraudMetadata() {
  return collectClientFraudMetadata();
}

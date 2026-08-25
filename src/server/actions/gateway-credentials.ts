"use server";

import type { GatewayCredentialPublic } from "@/server/hmrc/gateway-credentials";
import * as gateway from "@/server/hmrc/gateway-credentials";

export async function getMyGatewayCredentials(
  clientId: string,
): Promise<GatewayCredentialPublic> {
  return gateway.getMyGatewayCredentials(clientId);
}

export async function saveMyGatewayCredentials(
  input: Parameters<typeof gateway.saveMyGatewayCredentials>[0],
) {
  return gateway.saveMyGatewayCredentials(input);
}

export async function clearMyGatewayCredentials(clientId: string) {
  return gateway.clearMyGatewayCredentials(clientId);
}

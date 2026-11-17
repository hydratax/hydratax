/**
 * HMRC Agent Authorisation API (MTD-IT / MTD-VAT only).
 * @see https://developer.service.hmrc.gov.uk/api-documentation/docs/api/service/agent-authorisation-api/2.0
 *
 * CT and employer PAYE are NOT on this REST API — they use Agent Authorisation
 * Online (XML / portal). There is also no production Developer Hub API today
 * for agent CT or PAYE outstanding balances (those live in CT/PAYE for Agents).
 */

import { getHmrcConfig } from "@/server/hmrc/config";
import type { AgentAuthServiceKey } from "@/lib/desk-profile";

export const AGENT_AUTH_SCOPES = [
  "read:sent-invitations",
  "write:sent-invitations",
  "read:check-relationship",
  "write:cancel-invitations",
  "write:relationships",
] as const;

export type MtdAgentService = "MTD-IT" | "MTD-VAT";

export function deskKeyToMtdService(
  key: AgentAuthServiceKey,
): MtdAgentService | null {
  if (key === "mtd_it") return "MTD-IT";
  if (key === "mtd_vat") return "MTD-VAT";
  return null;
}

export function isMtdAgentAuthService(key: AgentAuthServiceKey): boolean {
  return key === "mtd_it" || key === "mtd_vat";
}

/** Online Agent Authorisation portal (CT / PAYE / legacy SA). */
export const ONLINE_AGENT_AUTH_GUIDANCE =
  "https://www.gov.uk/guidance/how-to-use-the-online-agent-authorisation-to-get-authorised-as-a-tax-agent";

export const AGENT_SERVICES_ACCOUNT =
  "https://www.tax.service.gov.uk/agent-services-account";

export const PAYE_FOR_AGENTS_GUIDANCE =
  "https://www.gov.uk/guidance/payecis-for-agents-online-service";

export const CT_FOR_AGENTS_GUIDANCE =
  "https://www.gov.uk/guidance/corporation-tax-for-agents-online-service";

type InviteBody =
  | {
      service: "MTD-IT";
      clientType: "personal";
      clientIdType: "ni";
      clientId: string;
      knownFact: string;
      agentType: "main" | "supporting";
    }
  | {
      service: "MTD-VAT";
      clientType: "business";
      clientIdType: "vrn";
      clientId: string;
      knownFact: string;
    };

export type AgentAuthApiResult = {
  ok: boolean;
  status: number;
  invitationId: string | null;
  location: string | null;
  rawText: string;
  data: unknown;
};

function acceptHeader() {
  return "application/vnd.hmrc.2.0+json";
}

export async function createAgentInvitation(opts: {
  arn: string;
  accessToken: string;
  body: InviteBody;
}): Promise<AgentAuthApiResult> {
  const cfg = getHmrcConfig();
  const arn = opts.arn.trim().toUpperCase();
  const url = `${cfg.apiBase}/agents/${encodeURIComponent(arn)}/invitations`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: acceptHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opts.body),
  });
  const rawText = await res.text();
  const location = res.headers.get("Location");
  const invitationId = location?.split("/").pop() ?? null;
  let data: unknown = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }
  return {
    ok: res.status === 204 || res.status === 201,
    status: res.status,
    invitationId,
    location,
    rawText,
    data,
  };
}

export async function checkAgentRelationship(opts: {
  arn: string;
  accessToken: string;
  body: InviteBody;
}): Promise<{ authorised: boolean; status: number; rawText: string }> {
  const cfg = getHmrcConfig();
  const arn = opts.arn.trim().toUpperCase();
  const url = `${cfg.apiBase}/agents/${encodeURIComponent(arn)}/relationships`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: acceptHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opts.body),
  });
  const rawText = await res.text();
  return {
    authorised: res.status === 204,
    status: res.status,
    rawText,
  };
}

export function buildInviteBody(opts: {
  service: AgentAuthServiceKey;
  clientId: string;
  knownFact: string;
  agentType?: "main" | "supporting";
}): InviteBody {
  if (opts.service === "mtd_it") {
    return {
      service: "MTD-IT",
      clientType: "personal",
      clientIdType: "ni",
      clientId: opts.clientId.replace(/\s/g, "").toUpperCase(),
      knownFact: opts.knownFact.trim().toUpperCase(),
      agentType: opts.agentType ?? "main",
    };
  }
  if (opts.service === "mtd_vat") {
    return {
      service: "MTD-VAT",
      clientType: "business",
      clientIdType: "vrn",
      clientId: opts.clientId.replace(/\D/g, ""),
      knownFact: opts.knownFact.trim(),
    };
  }
  throw new Error(
    "Corporation Tax and PAYE are not on the MTD Agent Authorisation API — use Online Agent Authorisation.",
  );
}

/** Absolute client-action URL when HMRC returns a relative Location. */
export function invitationClientUrl(
  location: string | null,
  invitationId: string | null,
): string | null {
  if (!location && !invitationId) return null;
  const cfg = getHmrcConfig();
  if (location?.startsWith("http")) return location;
  if (location?.startsWith("/")) return `${cfg.apiBase}${location}`;
  // ASA client journey (agent sends this style of link from ASA UI)
  if (invitationId) {
    return `https://www.tax.service.gov.uk/invitations/${invitationId}`;
  }
  return location;
}

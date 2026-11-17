"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDemoMode } from "@/lib/env";
import {
  type AgentAuthServiceKey,
  type AgentAuthorisationRecord,
} from "@/lib/desk-profile";
import { parseAddressParts } from "@/lib/address-parts";
import { requireSession } from "@/server/auth/session";
import { getClient } from "@/server/actions/clients";
import {
  buildInviteBody,
  checkAgentRelationship,
  createAgentInvitation,
  CT_FOR_AGENTS_GUIDANCE,
  invitationClientUrl,
  isMtdAgentAuthService,
  ONLINE_AGENT_AUTH_GUIDANCE,
  PAYE_FOR_AGENTS_GUIDANCE,
} from "@/server/hmrc/agent-authorisation";
import { getValidAccessToken } from "@/server/hmrc/tokens";
import { appendAuditEvent } from "@/server/audit/log";

const serviceSchema = z.enum([
  "mtd_it",
  "mtd_vat",
  "corporation_tax",
  "paye",
]);

async function writeAuth(
  clientId: string,
  service: AgentAuthServiceKey,
  record: AgentAuthorisationRecord,
) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }
  if (session.role === "readonly") throw new Error("Forbidden");

  const { patchDeskProfile } = await import("@/server/actions/desk");
  const profile = await patchDeskProfile(clientId, {
    agentAuthorisations: {
      ...(client.deskProfile?.agentAuthorisations ?? {}),
      [service]: record,
    },
  });
  revalidatePath(`/clients/${clientId}`);
  return profile.agentAuthorisations![service]!;
}

export async function getAgentAuthorisations(clientId: string) {
  const session = await requireSession();
  const client = await getClient(clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }
  return client.deskProfile?.agentAuthorisations ?? {};
}

const requestSchema = z.object({
  clientId: z.string().min(1),
  service: serviceSchema,
  agentArn: z.string().trim().min(1).max(20).optional(),
  knownFact: z.string().trim().max(40).optional(),
  agentType: z.enum(["main", "supporting"]).optional(),
  /** When true, only record pending + portal links (no HMRC API call). */
  trackOnly: z.boolean().optional(),
});

/**
 * Request agent authorisation for one of the four desks.
 * MTD-IT / MTD-VAT → Agent Authorisation REST (needs agent OAuth + ARN).
 * CT / PAYE → Online Agent Authorisation (tracked locally; open HMRC portal).
 */
export async function requestAgentAuthorisation(
  input: z.infer<typeof requestSchema>,
) {
  const data = requestSchema.parse(input);
  const session = await requireSession();
  const client = await getClient(data.clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }
  if (session.role === "readonly") throw new Error("Forbidden");

  const now = new Date().toISOString();

  if (!isMtdAgentAuthService(data.service) || data.trackOnly) {
    const guidance =
      data.service === "paye"
        ? PAYE_FOR_AGENTS_GUIDANCE
        : data.service === "corporation_tax"
          ? CT_FOR_AGENTS_GUIDANCE
          : ONLINE_AGENT_AUTH_GUIDANCE;
    const record = await writeAuth(data.clientId, data.service, {
      status: "pending",
      channel: "online_agent_authorisation",
      agentArn: data.agentArn?.trim().toUpperCase() || null,
      clientActionUrl: guidance,
      invitationId: null,
      expiresAt: null,
      knownFactUsed: data.knownFact?.trim() || null,
      lastCheckedAt: now,
      lastError: null,
      notes:
        data.service === "corporation_tax" || data.service === "paye"
          ? "HMRC has no MTD REST invite for this service — complete Online Agent Authorisation, then mark authorised here."
          : "Tracked pending without calling HMRC API.",
      updatedAt: now,
    });
    await appendAuditEvent({
      practiceId: session.practiceId,
      clientId: data.clientId,
      actorId: session.userId,
      action: "hmrc.agent_auth.request",
      entityType: "agent_authorisation",
      entityId: data.service,
    });
    return {
      record,
      mode: "online_agent_authorisation" as const,
      guidanceUrl: guidance,
      message:
        data.service === "corporation_tax"
          ? "CT authorisation is via Online Agent Authorisation / CT for Agents — not the MTD invite API. Request opened for tracking."
          : data.service === "paye"
            ? "PAYE authorisation is via Online Agent Authorisation / PAYE for Agents — not the MTD invite API. Request opened for tracking."
            : "Authorisation request tracked.",
    };
  }

  const arn = (data.agentArn ?? "").trim().toUpperCase();
  if (!arn) {
    throw new Error(
      "Enter your Agent Reference Number (ARN) from your Agent Services Account.",
    );
  }

  let clientIdValue = "";
  let knownFact = (data.knownFact ?? "").trim();

  if (data.service === "mtd_it") {
    clientIdValue = (client.nino ?? "").replace(/\s/g, "").toUpperCase();
    if (!clientIdValue) {
      throw new Error("Add the client’s NINO before requesting MTD Income Tax authorisation.");
    }
    if (!knownFact) {
      const addr = parseAddressParts(
        "address" in client
          ? ((client as { address?: string | null }).address ?? null)
          : null,
      );
      knownFact = addr.postcode;
    }
    if (!knownFact) {
      throw new Error(
        "Postcode (known fact) is required for MTD Income Tax authorisation.",
      );
    }
  } else {
    clientIdValue = (client.vrn ?? "").replace(/\D/g, "");
    if (!clientIdValue) {
      throw new Error("Add the client’s VRN before requesting MTD VAT authorisation.");
    }
    if (!knownFact || !/^\d{4}-\d{2}-\d{2}$/.test(knownFact)) {
      throw new Error(
        "VAT registration date (YYYY-MM-DD) is required as the known fact for MTD VAT.",
      );
    }
  }

  const body = buildInviteBody({
    service: data.service,
    clientId: clientIdValue,
    knownFact,
    agentType: data.agentType ?? "main",
  });

  if (isDemoMode()) {
    const invitationId = `DEMO${Date.now().toString(36).toUpperCase()}`;
    const expires = new Date();
    expires.setDate(expires.getDate() + 21);
    const record = await writeAuth(data.clientId, data.service, {
      status: "pending",
      channel: "mtd_api",
      agentArn: arn,
      agentType: data.service === "mtd_it" ? data.agentType ?? "main" : null,
      invitationId,
      clientActionUrl: invitationClientUrl(null, invitationId),
      expiresAt: expires.toISOString(),
      knownFactUsed: knownFact,
      lastCheckedAt: now,
      lastError: null,
      notes: "Demo invite — not sent to HMRC.",
      updatedAt: now,
    });
    return {
      record,
      mode: "mtd_api" as const,
      guidanceUrl: null as string | null,
      message: `Demo authorisation created. Send the client link before it expires (${expires.toISOString().slice(0, 10)}).`,
    };
  }

  const accessToken = await getValidAccessToken(
    data.clientId,
    session.practiceId,
  );
  if (!accessToken) {
    // Track pending and tell the accountant to connect agent OAuth / ASA.
    const record = await writeAuth(data.clientId, data.service, {
      status: "pending",
      channel: "mtd_api",
      agentArn: arn,
      agentType: data.service === "mtd_it" ? data.agentType ?? "main" : null,
      invitationId: null,
      clientActionUrl: null,
      expiresAt: null,
      knownFactUsed: knownFact,
      lastCheckedAt: now,
      lastError:
        "No HMRC OAuth token with agent invitation scopes. Connect as agent (Agent Services) or raise the invite in ASA, then refresh status here.",
      notes: null,
      updatedAt: now,
    });
    return {
      record,
      mode: "mtd_api" as const,
      guidanceUrl: "https://www.tax.service.gov.uk/agent-services-account",
      message:
        "Saved as pending. To create the digital invite via API, sign in with an Agent Services account that has invitation scopes (or create the invite in ASA and mark authorised when the client accepts).",
    };
  }

  const api = await createAgentInvitation({
    arn,
    accessToken,
    body,
  });

  if (!api.ok) {
    const errMsg =
      typeof api.data === "object" &&
      api.data &&
      "message" in api.data &&
      typeof (api.data as { message?: string }).message === "string"
        ? (api.data as { message: string }).message
        : `HMRC returned ${api.status}`;
    const record = await writeAuth(data.clientId, data.service, {
      status: "pending",
      channel: "mtd_api",
      agentArn: arn,
      agentType: data.service === "mtd_it" ? data.agentType ?? "main" : null,
      invitationId: api.invitationId,
      clientActionUrl: invitationClientUrl(api.location, api.invitationId),
      expiresAt: null,
      knownFactUsed: knownFact,
      lastCheckedAt: now,
      lastError: errMsg,
      notes: null,
      updatedAt: now,
    });
    return {
      record,
      mode: "mtd_api" as const,
      guidanceUrl: "https://www.tax.service.gov.uk/agent-services-account",
      message: `HMRC invite failed: ${errMsg}. Request kept as pending — use ASA or fix OAuth scopes (write:sent-invitations).`,
    };
  }

  const expires = new Date();
  expires.setDate(expires.getDate() + 21);
  const record = await writeAuth(data.clientId, data.service, {
    status: "pending",
    channel: "mtd_api",
    agentArn: arn,
    agentType: data.service === "mtd_it" ? data.agentType ?? "main" : null,
    invitationId: api.invitationId,
    clientActionUrl: invitationClientUrl(api.location, api.invitationId),
    expiresAt: expires.toISOString(),
    knownFactUsed: knownFact,
    lastCheckedAt: now,
    lastError: null,
    notes: null,
    updatedAt: now,
  });

  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: data.clientId,
    actorId: session.userId,
    action: "hmrc.agent_auth.request",
    entityType: "agent_authorisation",
    entityId: data.service,
  });

  return {
    record,
    mode: "mtd_api" as const,
    guidanceUrl: null as string | null,
    message:
      "Authorisation request created. Send the client the invite link — they must accept within 21 days.",
  };
}

export async function refreshAgentAuthorisationStatus(input: {
  clientId: string;
  service: AgentAuthServiceKey;
  agentArn?: string;
  knownFact?: string;
  agentType?: "main" | "supporting";
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }

  const existing =
    client.deskProfile?.agentAuthorisations?.[input.service] ?? null;
  const now = new Date().toISOString();

  if (!isMtdAgentAuthService(input.service)) {
    return {
      record: existing,
      message:
        "CT/PAYE authorisation status cannot be read from a Developer Hub API — confirm in CT/PAYE for Agents, then use Mark authorised.",
    };
  }

  const arn = (
    input.agentArn ||
    existing?.agentArn ||
    ""
  )
    .trim()
    .toUpperCase();
  if (!arn) {
    throw new Error("ARN required to check relationship status.");
  }

  let clientIdValue = "";
  let knownFact = (input.knownFact || existing?.knownFactUsed || "").trim();
  if (input.service === "mtd_it") {
    clientIdValue = (client.nino ?? "").replace(/\s/g, "").toUpperCase();
    if (!knownFact) {
      knownFact = parseAddressParts(
        "address" in client
          ? ((client as { address?: string | null }).address ?? null)
          : null,
      ).postcode;
    }
  } else {
    clientIdValue = (client.vrn ?? "").replace(/\D/g, "");
  }
  if (!clientIdValue || !knownFact) {
    throw new Error("Missing client identifier or known fact for status check.");
  }

  const body = buildInviteBody({
    service: input.service,
    clientId: clientIdValue,
    knownFact,
    agentType:
      input.agentType ||
      existing?.agentType ||
      "main",
  });

  if (isDemoMode()) {
    const record = await writeAuth(input.clientId, input.service, {
      ...(existing ?? {
        channel: "mtd_api",
        updatedAt: now,
      }),
      status: existing?.status === "authorised" ? "authorised" : "pending",
      agentArn: arn,
      knownFactUsed: knownFact,
      lastCheckedAt: now,
      lastError: null,
      updatedAt: now,
    });
    return { record, message: "Demo status refreshed." };
  }

  const accessToken = await getValidAccessToken(
    input.clientId,
    session.practiceId,
  );
  if (!accessToken) {
    throw new Error(
      "Connect HMRC with agent invitation scopes to check relationship status, or mark authorised manually.",
    );
  }

  const check = await checkAgentRelationship({
    arn,
    accessToken,
    body,
  });

  const status = check.authorised
    ? ("authorised" as const)
    : existing?.status === "authorised"
      ? ("deauthorised" as const)
      : existing?.status === "pending"
        ? ("pending" as const)
        : ("not_requested" as const);

  const record = await writeAuth(input.clientId, input.service, {
    ...(existing ?? { channel: "mtd_api", updatedAt: now }),
    status,
    agentArn: arn,
    knownFactUsed: knownFact,
    lastCheckedAt: now,
    lastError: check.authorised
      ? null
      : check.status === 404
        ? "No active relationship (client has not authorised yet)."
        : `HMRC status ${check.status}`,
    updatedAt: now,
  });

  return {
    record,
    message: check.authorised
      ? "Authorised — HMRC confirms an active agent relationship."
      : "Not authorised yet on HMRC.",
  };
}

export async function setAgentAuthorisationManualStatus(input: {
  clientId: string;
  service: AgentAuthServiceKey;
  status: "authorised" | "not_requested" | "rejected" | "deauthorised";
  notes?: string;
}) {
  const session = await requireSession();
  const client = await getClient(input.clientId);
  if (!client || client.practiceId !== session.practiceId) {
    throw new Error("Client not found");
  }
  const existing =
    client.deskProfile?.agentAuthorisations?.[input.service] ?? null;
  const now = new Date().toISOString();
  const record = await writeAuth(input.clientId, input.service, {
    ...(existing ?? {
      channel: isMtdAgentAuthService(input.service)
        ? "mtd_api"
        : "online_agent_authorisation",
      updatedAt: now,
    }),
    status: input.status,
    lastCheckedAt: now,
    lastError: null,
    notes: input.notes?.trim() || existing?.notes || null,
    updatedAt: now,
  });
  await appendAuditEvent({
    practiceId: session.practiceId,
    clientId: input.clientId,
    actorId: session.userId,
    action: "hmrc.agent_auth.manual_status",
    entityType: "agent_authorisation",
    entityId: input.service,
  });
  return record;
}

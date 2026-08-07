import { getHmrcConfig } from "./config";
import {
  assertCompleteFraudHeaders,
  type FraudHeaderMap,
} from "./fraud-headers";
import { sha256Hex } from "./crypto";
import { appendAuditEvent } from "@/server/audit/log";

export type HmrcRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  accessToken: string;
  fraudHeaders: FraudHeaderMap;
  body?: unknown;
  accept?: string;
  actorId: string;
  clientId?: string;
  practiceId?: string;
  action: string;
};

export type HmrcResponse<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  rawText: string;
  correlationId: string | null;
};

export async function hmrcFetch<T = unknown>(
  opts: HmrcRequestOptions,
): Promise<HmrcResponse<T>> {
  assertCompleteFraudHeaders(opts.fraudHeaders);

  const cfg = getHmrcConfig();
  const url = opts.path.startsWith("http")
    ? opts.path
    : `${cfg.apiBase}${opts.path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    Accept: opts.accept ?? "application/vnd.hmrc.1.0+json",
    ...opts.fraudHeaders,
  };

  let bodyText: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyText = JSON.stringify(opts.body);
  }

  const payloadHash = bodyText ? sha256Hex(bodyText) : undefined;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: bodyText,
  });

  const rawText = await res.text();
  const correlationId =
    res.headers.get("X-Correlation-ID") ??
    res.headers.get("x-correlation-id");

  let data: T | null = null;
  try {
    data = rawText ? (JSON.parse(rawText) as T) : null;
  } catch {
    data = null;
  }

  await appendAuditEvent({
    practiceId: opts.practiceId,
    clientId: opts.clientId,
    actorId: opts.actorId,
    action: opts.action,
    entityType: "hmrc_request",
    entityId: opts.path,
    payloadHash,
    hmrcStatusCode: res.status,
    hmrcCorrelationId: correlationId,
    detail: {
      method: opts.method ?? "GET",
      path: opts.path,
      env: cfg.env,
      ok: res.ok,
      responseSnippet: rawText.slice(0, 2000),
    },
  });

  return {
    ok: res.ok,
    status: res.status,
    data,
    rawText,
    correlationId,
  };
}

/**
 * Cloudflare D1 access from Netlify/Node via the HTTP API.
 * Used for heavy desk tables so Supabase stays on auth + light metadata.
 */

export function isD1Configured(): boolean {
  return Boolean(
    (process.env.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CLOUDFLARE_R2_ACCOUNT_ID) &&
      (process.env.CLOUDFLARE_API_TOKEN ||
        process.env.CLOUDFLARE_D1_API_TOKEN) &&
      process.env.CLOUDFLARE_D1_DATABASE_ID,
  );
}

type D1QueryResult = {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result?: Array<{
    results?: Record<string, unknown>[];
    success?: boolean;
    meta?: { changes?: number; last_row_id?: number };
  }>;
};

function d1Config() {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_D1_API_TOKEN;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  if (!accountId || !apiToken || !databaseId) {
    throw new Error(
      "Cloudflare D1 is not configured. Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_D1_DATABASE_ID.",
    );
  }
  return { accountId, apiToken, databaseId };
}

export async function d1Query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { accountId, apiToken, databaseId } = d1Config();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
    signal: AbortSignal.timeout(12_000),
  });
  const body = (await res.json()) as D1QueryResult;
  if (!res.ok || !body.success) {
    const msg =
      body.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      `D1 query failed (${res.status})`;
    throw new Error(msg);
  }
  return (body.result?.[0]?.results ?? []) as T[];
}

export async function d1Execute(
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await d1Query(sql, params);
}

export async function d1Batch(
  statements: Array<{ sql: string; params?: unknown[] }>,
): Promise<void> {
  const { accountId, apiToken, databaseId } = d1Config();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  // D1 HTTP API accepts one statement per call; run sequentially for reliability.
  for (const stmt of statements) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: stmt.sql,
        params: stmt.params ?? [],
      }),
    });
    const body = (await res.json()) as D1QueryResult;
    if (!res.ok || !body.success) {
      const msg =
        body.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
        `D1 batch step failed (${res.status})`;
      throw new Error(msg);
    }
  }
}

export function d1Json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function d1ParseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export function d1Bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function d1BoolInt(value: boolean | undefined): number {
  return value ? 1 : 0;
}

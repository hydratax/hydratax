const accountId =
  process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;

const missing = [
  ["CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_R2_ACCOUNT_ID", accountId],
  ["CLOUDFLARE_API_TOKEN", apiToken],
  ["CLOUDFLARE_D1_DATABASE_ID", databaseId],
].filter(([, v]) => !v);

if (missing.length) {
  console.log("D1_MISSING", missing.map(([k]) => k).join(", "));
  process.exit(1);
}

(async () => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" }),
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    console.log("D1_RESULT fail");
    console.log("HTTP", res.status);
    console.log("ERR", JSON.stringify(body.errors ?? body));
    process.exit(1);
  }
  const tables = body.result?.[0]?.results?.map((r) => r.name) ?? [];
  console.log("D1_RESULT success");
  console.log("TABLES", tables.length ? tables.join(", ") : "(none yet — run migrations)");
})();

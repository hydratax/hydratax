# Storage split: Supabase + Cloudflare

HydraTax keeps **Supabase** for auth and light relational data, and moves heavy desk/workload data to **Cloudflare** so free-tier Supabase limits are less likely to bite.

## What lives where

| Data | Store |
|------|--------|
| Auth users, sessions | Supabase Auth |
| Practices, members, subscriptions | Supabase Postgres |
| Clients (practice desk metadata) | Supabase Postgres |
| Document **metadata** (`client_documents`) | Supabase Postgres |
| Document **files** | Cloudflare **R2** |
| Employees, pay runs, timesheets | Cloudflare **D1** |
| Ledger entries | Cloudflare **D1** |
| VAT returns | Cloudflare **D1** |
| Bank transactions | Cloudflare **D1** |

When D1 env vars are **not** set, desk modules fall back to Supabase (then Drizzle/`DATABASE_URL` if present).

## Cloudflare D1 setup

1. Install / login:

```bash
npx wrangler login
```

2. Create the database:

```bash
npx wrangler d1 create hydratax-desk
```

Copy the `database_id` into `wrangler.toml` and into env as `CLOUDFLARE_D1_DATABASE_ID`.

3. Apply schema:

```bash
npx wrangler d1 migrations apply hydratax-desk --remote
```

Schema file: `migrations/d1/0001_desk_tables.sql`.

4. Create an API token (Cloudflare dashboard → My Profile → API Tokens) with **Account → D1 → Edit**.

5. Set on Netlify (and `.env.local`):

```bash
CLOUDFLARE_ACCOUNT_ID=...          # or reuse CLOUDFLARE_R2_ACCOUNT_ID
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_D1_DATABASE_ID=...
```

## Cloudflare R2 (documents)

See previous R2 section / `.env.example`. Uploads prefer R2; metadata stays in Supabase `client_documents`.

## Access control

D1 has no RLS. Every desk action still calls `getClient(clientId)` (Supabase) first so only practice members can read/write that client’s D1 rows.

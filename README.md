# HydraTax

Multi-client HMRC practice platform for UK accountants.

File **MTD VAT**, **Self Assessment**, **CT600**, and **payroll (RTI FPS/EPS)** from one desk — with integer-pence books, Stripe billing, document upload, fraud-prevention headers, AES-256 token storage, and an immutable audit trail.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without `DATABASE_URL`, the app uses an **empty** local memory practice so you can add real clients while wiring Neon/Clerk. For production SaaS set Clerk, Neon, Stripe, Blob, and HMRC keys.

## Stack

- Next.js App Router + TypeScript + Tailwind
- Clerk Organizations (sign-up / sign-in)
- Neon Postgres + Drizzle
- Stripe Checkout (subscriptions + one-off filings)
- Vercel Blob (client documents)
- Zod validation + Vitest

## Environment

See `.env.example`. Essentials:

| Variable | Purpose |
|----------|---------|
| Clerk keys | Real practice auth + orgs |
| `DATABASE_URL` | Neon Postgres |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Payments |
| `BLOB_READ_WRITE_TOKEN` | Document storage |
| `HMRC_*` + `TOKEN_ENCRYPTION_KEY` | HMRC OAuth + token crypto |
| `MEMORY_STORE` | Local empty store only (never in production) |

## Pricing & checkout

`/pricing` — interactive service tabs → plan cards → Stripe Checkout → `/checkout/success` → sign-up.

Webhook: `POST /api/stripe/webhook`

## Documents & HMRC submit

1. Client workspace → **Documents** — upload PDF/images/CSV/Excel
2. **Books** + tax module — prepare → review
3. **Settings → HMRC** — OAuth connect per client
4. **Submit** — statutory payload + fraud headers; audit receipt stored

What you need for HMRC: [docs/hmrc-integration.md](docs/hmrc-integration.md)

## Scripts

```bash
npm run dev
npm run build
npm test
npm run db:push   # when DATABASE_URL is set
```

## Compliance

See [docs/hmrc-compliance.md](docs/hmrc-compliance.md) and [content.md](content.md).

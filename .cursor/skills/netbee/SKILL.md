---
name: netbee
description: >-
  HydraTax Netlify + deploy agent. Use when the user says "netbee", or asks about
  Netlify, deploy, production secrets, env vars on Netlify, polling deploys, or
  shipping to hydratax.uk. Ensures required env vars, deploys via git push, and
  never prints secret values.
---

# netbee — HydraTax Netlify + deploy

You are **netbee**. Repo root is the HydraTax project. Historical site id:
`5db54446-e5bc-4eb8-91f4-efb8f34a1d3d` (project: `hydratax`, domain: `https://hydratax.uk`).

## Triggers

Apply this skill when the user says **netbee**, or asks about Netlify, deploy,
production secrets, Netlify env vars, or shipping to production.

## Hard rules

- **Never print secret values** (tokens, keys, whsec, salts, ENCRYPTION keys).
  Report **names only** and whether they were already set / newly generated / skipped.
- Prefer **`git push origin HEAD`** (or `git push -u origin HEAD`) to main so
  Netlify builds from Git. Local `netlify deploy` often fails on Windows with
  **EPERM** — avoid it unless the user insists.
- Token for Netlify API may be in `%APPDATA%\netlify\Config\config.json` —
  read it for API calls; **never print** it.
- Do **not** ask the user to set env vars or click Deploy if you can do it via
  CLI/API and git.
- Follow git safety: no `git config` changes, no `--no-verify`, no force push to
  main, no committing `.env*` or real secrets. Commit only when the user
  authorized deploy/commit.
- When present, follow `docs/security/deploy-checklist.md` for env names, smoke
  tests, and migration order.

## 1. Ensure required env vars

Use `netlify env` CLI linked to this site, or the Netlify Env API
(`GET/POST/PUT /api/v1/accounts/{account_id}/env?site_id=…`).

### Generate if missing (cryptographically strong)

Use Node `crypto.randomBytes` (e.g. 32-byte hex). Set on **production** (and
preview only when appropriate). **Never overwrite** an existing non-empty secret
unless the user asked to rotate intentionally.

- `CRON_SECRET`
- `EMAIL_WEBHOOK_SECRET`
- `TOKEN_ENCRYPTION_KEY` — **CRITICAL**: if already set, **NEVER rotate**
  (would break encrypted HMRC tokens). If missing, generate 32-byte hex/base64
  and set once.
- `MFA_COOKIE_SECRET`
- `HMRC_STATE_SECRET`
- `SECURITY_EVENT_SALT`

### Do not invent (verify or leave)

- `STRIPE_WEBHOOK_SECRET` — set only if you can retrieve the **real** Stripe
  webhook signing secret (`whsec_…`) from Stripe CLI/dashboard config already on
  the machine; otherwise leave existing or document that Stripe Dashboard must
  provide it. **Do not invent a fake whsec** (breaks payments).
- `WHATSAPP_APP_SECRET` — only if Meta secret already exists elsewhere in env;
  do not invent.
- `RESEND_WEBHOOK_SECRET` — only if real `whsec` available; do not invent fake.
- `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_*` — do not invent; verify
  they exist; if missing try to read from local `.env` (**without printing**) and
  set on Netlify.
- Confirm `DATABASE_URL`, Stripe keys, and `RESEND_API_KEY` are already present
  (names only in reports).

## 2. Migrations before/with deploy

Security/GDPR migrations (or timestamped equivalents):

- `security_hardening_rls`
- `security_hardening_public_data`
- `uk_gdpr_data_rights`

Use Supabase MCP `list_migrations`. If not applied, wait ~60–90s and recheck
(supabee may be applying in parallel). If still missing, apply SQL from
`supabase/migrations/` via `apply_migration`. Prefer not double-applying —
skip if already listed.

## 3. Pre-deploy verification

- If `next dev` is running, do not kill it unless needed; you may still push —
  Netlify builds remotely.
- Run `npx tsc --noEmit` and `npx vitest run` when feasible; fix only blockers.
- Optionally `npm run build`; skip if EPERM / `.next` lock and rely on Netlify.

## 4. Commit + push (when user authorized)

1. Parallel: `git status`, `git diff`, `git log -5`
2. Stage intentional changes. Exclude `.env*`, secrets, scratch `.tmp-*`,
   personal probe scripts. **Do** commit `.cursor/skills/netbee` and
   `.cursor/skills/supabee` when present.
3. Commit with a clear message (PowerShell: use `git commit -m "…"` or a temp
   file — bash HEREDOC is unavailable).
4. `git push -u origin HEAD` (or `origin main`).
5. Poll deploy state via Netlify API until ready/error. On build failure: fetch
   logs, fix, commit again, push.

## 5. Post-deploy smoke (no secrets in output)

Against `https://hydratax.uk`:

- `curl -I` — security headers present
- `POST` unsigned Stripe webhook — expect `400`/`503`
- `GET` cron without auth — expect `401`/`503`

Report status codes and header names only.

## Final report template

- Skill path (if created/updated)
- Env vars: already set vs newly generated vs skipped (names only)
- Migration readiness
- Commit hash, push result, Netlify deploy URL/state
- Smoke test results
- Anything truly impossible without a human (e.g. inventing Stripe `whsec`)
  listed once at the end

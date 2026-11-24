# Local Companies House directory (free-tier safe)

Keeps the multi‑GB Basic Company Data dump **on this machine only**. Nothing is
uploaded to Supabase or Cloudflare.

## 1. Place the dump

- `data/Companies House/BasicCompanyDataAsOneFile-*.zip`, or
- `data/companies-house/BasicCompanyDataAsOneFile-*.zip`

## 2. Import → local hub files

```bash
npm run ch:import-directory
```

Streams the CSV and writes gitignored JSONL hubs under `data/companies-house/hubs/`
(SEO industries + major towns, including Bradford). Uses **no cloud quota**.

## 3. Typeahead search index (all active companies)

```bash
npm run ch:build-search-index
```

Writes gitignored name/number shards under `data/companies-house/search/` so
public search works without burning the live Companies House API quota.

## 4. Optional sitemap shards

```bash
npm run ch:generate-sitemaps
```

Writes gitignored XML under `data/companies-house/sitemaps/`. Copy into
`public/company-sitemaps/` only when you are ready for that deploy size.

## Runtime

When hub JSONL files exist, industry/location pages read them first (no Companies
House advanced-search). Typeahead uses the search index when present. If missing,
hubs fall back to the live API. Company profile pages still use the live API for
full facts when opened or crawled.

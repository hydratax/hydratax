# Open Banking, PDF→CSV & bank reconciliation (HydraTax)

## What works today

1. **CSV / Excel upload** — parse date / description / amount, merchant rules, auto-categorise.
2. **PDF / photo convert** — browser PDF.js text extract + OCR fallback → preview → download CSV/Excel or save to books.
3. **Provisional review heads (no LLM)** — unknown payees that are material (≥ £5,000 total or single line, or ≥ 10 lines / 3% of statement) get a `Review: …` custom head. Accountant maps the whole head once; identifier rules stick for next imports.
4. **Invoice ↔ bank suggestions** — deterministic amount + date window + invoice number / reference overlap (`src/server/bank/invoice-bank-match.ts`).

## Provisional heads (rules engine)

| Threshold | Effect |
|-----------|--------|
| Cluster absolute total ≥ £5,000 | Create `Review: Payee (£X)` |
| Any single line ≥ £5,000 | Same |
| ≥ 10 lines same counterparty key | Same |
| ≥ 3% of statement lines (min 3) | Same |

Counterparty key strips card/FP/DD noise, dates, amounts, and long refs. On map, merchant_identifiers are retargeted to the chosen statutory / Note 8 head.

---

## Robust plan: UK bank PDF → CSV

Goal: behave like online converters for HSBC, Barclays, NatWest, Lloyds, Santander, Monzo, Starling, Revolut, Metro, Nationwide, Amex.

### Phase A — already shipping
- Browser PDF.js text-layer → row rebuild (`pdf-text-items-to-lines`)
- OCR (Tesseract) for scanned / image-only PDFs (cap pages)
- UK line parser: DMY / dotted dates, CR/DR, money-out | money-in | balance columns
- Preview table + Download CSV/Excel + Save to books

### Phase B — bank layout profiles (next)
1. Collect 2–3 anonymised sample PDFs per major UK bank (practice clients).
2. Add `detectBank()` profiles with column heuristics (e.g. NatWest money out/in, Monzo signed amount).
3. Regression fixtures: raw extracted text → expected CSV rows in vitest.
4. Prefer bank CSV/Excel export in UI copy when OCR confidence is low.

### Phase C — quality & ops
1. Per-import `bankHint` + parse warning surfaced in the desk.
2. Store source PDF on the client document file (already) for audit.
3. Optional server-side pdfplumber-class pipeline only if browser OCR fails at scale — keep primary path in-browser to avoid shipping statement bytes to a third-party OCR SaaS.

### Phase D — do not invent
- Never invent transactions from balances alone.
- Never auto-file provisional heads into Note 8 without accountant map.

---

## Plan of action: TrueLayer bank connect

Hydra already records `bank.connect.requested` and checks `TRUELAYER_CLIENT_ID`. Live OAuth is still a stub.

### Steps
1. **Commercial** — Create a TrueLayer console app (sandbox → live). Agree AIS Data API scope for transaction history.
2. **Regulatory path (see below)** — Decide **Agent of TrueLayer** vs own **FCA RAISP**. Agent is the usual launch path for SaaS while you assess whether you need your own permission.
3. **Env** — `TRUELAYER_CLIENT_ID`, `TRUELAYER_CLIENT_SECRET`, redirect URI `https://hydratax.uk/api/bank/truelayer/callback` (sandbox + prod).
4. **OAuth** — Auth Dialog → callback → encrypt refresh token (same vault pattern as HMRC GG / tokens) keyed by client + practice.
5. **Sync** — Job/cron pulls transactions into `bank_transactions`, then the **same** pipeline: identifier rules → provisional heads → desk.
6. **Consent UX** — Client consent screen, revoke, last sync time, TrueLayer disclaimer (required under Agent model).
7. **Fallback** — CSV/PDF upload remains first-class; Open Banking is additive.

### Do you need official certification for TrueLayer bank connect?

**Short answer:** You need a **regulated AIS route**, but you usually do **not** need your own FCA licence on day one if TrueLayer accepts you as an **Agent**.

| Path | What it means |
|------|----------------|
| **TrueLayer Agent model** | TrueLayer (FCA FRN 901096) provides the regulated AIS. You show TrueLayer name/logo on bank selection, no full white-label, and a disclaimer that TrueLayer provides the AIS. Good for launch. |
| **Own FCA RAISP / AISP** | Required if you want to be the regulated AIS provider yourself (e.g. fully white-labelled consolidated account views long-term). Apply to FCA; TrueLayer can still be the technical provider. |
| **“No regulation”** | Not available if you show users consolidated account information from their banks — that is regulated AIS activity. |

Confirm current Agent eligibility and wording with TrueLayer sales/compliance — rules can change; treat their help centre + your counsel as source of truth:

- [Do I need to be regulated for AIS?](https://support.truelayer.com/hc/en-us/articles/360005555613-Do-I-need-to-be-regulated-to-provide-Account-Information-Services-AIS)
- [Agent model limitations](https://support.truelayer.com/hc/en-us/articles/360016448777-What-are-the-limitations-to-the-agent-model)

### Alternatives
- **GoCardless Bank Account Data** (ex-Nordigen) or **Plaid** — same AIS regulatory question; Hydra’s connect stub already accepts those env keys.

## HMRC / compliance notes

- Categorisation and Open Banking feeds are **assistive** — partner review before SA / CT submit is mandatory.
- Prefer encrypted token storage and client consent records for Open Banking.

## CSV format

```csv
date,description,amount
01/04/2026,Client invoice payment,2500.00
02/04/2026,Office rent,-1200.00
```

Or debit/credit columns:

```csv
date,description,debit,credit
01/04/2026,Sale,,2500.00
02/04/2026,Rent,1200.00,
```

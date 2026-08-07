# Open Banking & bank statements (HydraTax)

## What works today

1. **CSV bank statement upload** — parse date / description / amount, auto-categorise, edit categories, draft **Self Assessment** and **Corporation Tax** totals in one click.
2. **PDF statement upload** — stored on the client document file for review (full OCR extraction is a later add-on).

## Open Banking (live bank connect)

UK Open Banking lets the client consent to share transactions. Hydra is structured to feed the **same categorisation pipeline** used for CSV.

| Provider | Notes |
|----------|--------|
| **TrueLayer** | Strong UK Open Banking coverage; OAuth + Data API |
| **Plaid** | UK banks via Open Banking; Link UX |
| **GoCardless Bank Account Data** | Formerly Nordigen; good for AIS |

### To enable

1. Register as a consumer with the provider (and complete any FCA / agent requirements they mandate).
2. Set env vars: `TRUELAYER_CLIENT_ID` / `TRUELAYER_CLIENT_SECRET` (or Plaid / GoCardless equivalents).
3. Implement OAuth callback → store refresh tokens encrypted (same pattern as HMRC tokens).
4. Sync transactions on a schedule into `bank_transactions`.

Hydra already records `bank.connect.requested` in the audit log when an accountant clicks **Connect bank**.

## HMRC / compliance notes

- Categorisation is **assistive** — partner review before SA / CT submit is mandatory.
- Do not treat bank AI as a substitute for proper books.
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

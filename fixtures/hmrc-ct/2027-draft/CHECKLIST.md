# CT600 April 2027 — SDS implementation tracker

**Policy:** SDS updates are coded as soon as they land. Behaviour is **date-gated** by HMRC effective dates (AP start / expenditure / loan date). Current-year filings keep current rates; periods that match the SDS dates pick up the new rates and stationery automatically.

Source pack: this folder (SDS email 17 Nov 2026).

| Status | Meaning |
|--------|---------|
| `n/a` | Out of product scope until CT600A/L/E are built |
| `todo` | Still to wire |
| `done` | Shipped — evidence path/test named |

---

## Main CT600

| ID | Change | Status | Evidence |
|----|--------|--------|----------|
| M0 | Install CT600 04-27 PDF + period-based edition | `done` | `public/hmrc/CT600-2027-v3.pdf`, `form-edition.ts`, `official-fill.ts` |
| M1 | Boxes **696** / **739** main-rate FYA + 40%/50% by spend date | `done` | `capital-allowances-rates.ts` + `.test.ts`; ledger fields; box map in `buildCt600BoxValues`; fill spec `spec-ct600-2027-v3.json` |
| M2 | ZEC / EV charge-point FYA cutoff → 1 Apr 2027 | `done` | `zeroEmissionFya*` helpers + tests |
| M3 | Box 615 guidance (merged-scheme statute) | `done` | Rulebook note via M1 pack / rates.ts CT facts (guidance-only until RDEC desk) |
| M4 | Rulebook facts for FYA / ZEC / s455 | `done` | `src/lib/hmrc-rulebook/rates.ts` (`ct-main-rate-fya`, `ct-zec-ev-fya-cutoff`, `ct-s455-rate`) |

## Supplementaries

| ID | Form | Change | Status | Evidence |
|----|------|--------|--------|----------|
| A1 | CT600A | s455 **35.75%** from 6 Apr 2026 | `done` (rate helper) | `loansToParticipatorsRatePercent` — full CT600A XML still unsupported |
| L1 | CT600L | Step 2 / surrender clarifications | `n/a` | R&D desk not in product |
| E1 | CT600E | Legacy wording | `n/a` | Charities out of scope |

## How to verify

1. Open this checklist — rows you care about say `done`.
2. Run: `npx vitest run src/server/hmrc/ct600/capital-allowances-rates.test.ts src/server/hmrc/ct600/official-fill.test.ts`
3. Period start `2027-04-01` → fills `CT600-2027-v3.pdf`; earlier APs → `CT600-2026-v3.pdf`.
4. Spend date `2026-06-01` → 40% FYA; `2027-01-01` → 50%.

## Next SDS drop

Drop files in a new dated folder under `fixtures/hmrc-ct/`, extend rate helpers + form edition, update this tracker in the same PR/change set.

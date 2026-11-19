# RTI volume & HMRC limits (bureau-scale)

Audience: builders. How HydraTax should convey ~1,000 company FPS/EPS submissions to HMRC in one payday window.

## Verdict (short)

| Question | Answer |
| --- | --- |
| Is submitting FPS/EPS for many employers in one day **allowed**? | **Yes.** Agents/bureaux routinely do this. Each employer scheme is a separate EmpRef. |
| One mega-FPS for 1,000 companies? | **No.** One FPS (or EPS) document per **PAYE reference** (`EmpRefs`). |
| Published cap on submissions per software house / Vendor ID / day? | **Not published** in RTI generic specs or the Transaction Engine Document Submission Protocol reviewed for this doc. Treat as **unknown**. |
| Concurrent connections? | TE protocol **explicitly allows batch mode** (submit many, poll later by `CorrelationID`). No numeric max concurrency published. |
| How should HydraTax do ~1,000 FPS? | **Queue + throttle**: serialize or low concurrency (e.g. 1–2 in flight), respect `PollInterval`, gap ~2.5s between posts, per-practice fairness. |

## Submission model (accurate)

1. **Per employer EmpRef** — GovTalk keys use `TaxOfficeNumber` / `TaxOfficeReference` from that company’s PAYE ref. HydraTax already builds one envelope per client pay run (`HMRC-PAYE-RTI-FPS` / `HMRC-PAYE-RTI-EPS`).
2. **Agent / bureau auth** — Accountant enrols **PAYE for Agents**, authorises each client (Online Agent Authorisation). Software submits with the agent’s Gateway User ID/password; each message still carries that employer’s EmpRef keys. See [PAYE for Agents](https://www.gov.uk/guidance/payecis-for-agents-online-service).
3. **Not “one Gateway user = one company”** — One agent GG can cover many authorised EmpRefs. Alternatively employers can use their own GG; HydraTax stores credentials per user (+ optional per-client).
4. **Vendor ID / ChannelRouting** — Product identification for HMRC; **no published daily RTI quota** tied to Vendor ID in the public TE/RTI docs cited below.

## Official sources checked

| Source | What it says about volume |
| --- | --- |
| [Transaction Engine DSP (PDF)](https://assets.publishing.service.gov.uk/media/5b90f59de5274a0bd7d11954/Transaction.pdf) | Client **may operate in batch mode**: submit multiple documents, then poll/delete by `CorrelationID`. Wait at least `PollInterval` seconds before poll. **No numeric concurrency or daily cap stated.** |
| [RTI generic technical specifications](https://www.gov.uk/government/publications/real-time-information-internet-submissions-generic-technical-specifications) | Points at TE + IRmark guidance; tax-year RIM artefacts. **No software-house FPS/day cap published on the landing page.** |
| [RTI support for software developers](https://www.gov.uk/government/collections/real-time-information-online-internet-submissions-support-for-software-developers) | Spec collections; contact `SDSTeam@hmrc.gov.uk` for questions. |
| [Reporting to HMRC: FPS](https://www.gov.uk/running-payroll/reporting-to-hmrc) | Employer must send FPS on/before payday; may split FPS into batches (e.g. employees vs directors) — still **one employer**. |
| HMRC Developer Hub API rate limits (REST APIs, e.g. CDS notes) | Often **~150 requests/minute** default for *REST* APIs — **not** confirmed as applying to classic Transaction Engine XML RTI. Do **not** treat 150/min as an official RTI TE cap. |

If SDST later publishes a TE concurrency or Vendor ID quota, update this doc and the throttle constants together.

## Practical engineering guidance (HydraTax)

HMRC has not published a hard “max FPS per software per day.” Failures at bureau scale are usually:

- Gateway auth / enrolment / authorisation gaps per EmpRef  
- Schema / business-rule rejects (one bad FPS does not stop the next EmpRef)  
- Network / TE overload if thousands of sync submit+poll loops fire in parallel from one serverless instance  
- Serverless **time budgets** (one HTTP request cannot sync-submit 1,000 FPS)

### Recommended HydraTax behaviour

1. **Keep desk sync submit** for single-company “Submit FPS” (current path via `submitAndPollRtiXml`).
2. **Bureau / multi-company payday** → enqueue into `rti_submit_jobs` (migration `20261119010000_bulk_import_and_rti_queue.sql`).
3. **Worker** (`/api/cron/payroll-jobs` or Netlify `payroll-jobs-cron`): claim with `SKIP LOCKED`, process **2** jobs per tick by default, sleep **`RTI_MIN_GAP_MS` (2500)** between posts.
4. **Respect PollInterval** from acknowledgements (already in `rti-submit.ts`). Prefer acknowledge → continue other EmpRefs → poll, once batch mode is fully wired; until then sync submit+poll per job is OK at low concurrency.
5. **Do not store Gateway passwords** in queue rows long-term if avoidable — prefer re-read from `user_gateway_credentials` at claim time (future hardening). Current enqueue stub allows meta for enablement tests only.
6. **Feature flag** `RTI_SUBMIT_QUEUE_ENABLED=true` before the worker claims RTI rows. Until then, enqueue stubs sit queued; desk sync remains live.
7. **Capacity sketch** at 2.5s gap, 1 worker, 10h window ≈ **14,400** submits/day theoretical upper bound before poll time — enough for 1,000 FPS with headroom. Real capacity is lower once poll rounds are included; use 2 workers only after observing TE behaviour.

### Helpers in code

| Module | Role |
| --- | --- |
| `src/server/hmrc/rti-submit-queue.ts` | `decideRtiSubmitPath`, `enqueueThrottledRtiSubmit`, capacity estimate |
| `src/server/payroll/jobs/processor.ts` | Cron tick (bulk + RTI when enabled) |
| `src/server/hmrc/rti-submit.ts` | Live TE submit + poll |

## Gaps / follow-ups

- Wire desk “submit all clients” (future bureau desk) to enqueue instead of N parallel server actions.  
- Re-fetch Gateway credentials at claim time; scrub `envelope_xml` after success (already nulled on complete).  
- Confirm any unpublished TE guidance with SDST before marketing “unlimited bureau RTI.”  
- Optional: true batch mode (submit many acks, poll asynchronously) for higher throughput without raising in-flight posts.

export type SupportCategoryId =
  | "getting-started"
  | "troubleshooting"
  | "ct600"
  | "vat"
  | "self-assessment"
  | "payroll"
  | "hmrc-connection"
  | "practice";

export type SupportArticle = {
  slug: string;
  title: string;
  summary: string;
  category: SupportCategoryId;
  popular?: boolean;
  body: string[];
};

export const SUPPORT_CATEGORIES: Array<{
  id: SupportCategoryId;
  title: string;
  blurb: string;
}> = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "Open a practice, add clients, and take your first filing from draft to HMRC.",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    blurb: "Decode gateway rejections, pending states, and “why didn’t this land?” moments.",
  },
  {
    id: "ct600",
    title: "Corporation Tax",
    blurb: "CT600 periods, credentials, amendments, and what to expect after submit.",
  },
  {
    id: "vat",
    title: "MTD VAT",
    blurb: "Obligations, box drafts from books, reconnecting MTD, and repayment returns.",
  },
  {
    id: "self-assessment",
    title: "Self Assessment",
    blurb: "Quarterly updates, digital records, and reading the tax calculation.",
  },
  {
    id: "payroll",
    title: "PAYE & RTI",
    blurb: "Employees, payday FPS, EPS when nothing is paid, and employer refs.",
  },
  {
    id: "hmrc-connection",
    title: "HMRC connection",
    blurb: "OAuth links, expired tokens, fraud-prevention headers, and sandbox vs live.",
  },
  {
    id: "practice",
    title: "Practice desk",
    blurb: "Multi-client workflows, deadlines, audit trail, and team roles.",
  },
];

export const SUPPORT_ARTICLES: SupportArticle[] = [
  {
    slug: "first-week-on-hydratax",
    title: "Your first week on the Hydra desk",
    summary:
      "How to create a practice workspace, seed clients, connect HMRC sandbox, and complete a guided filing.",
    category: "getting-started",
    popular: true,
    body: [
      "HydraTax is built for accountants who juggle many entities. Start in the practice dashboard, add a client, and choose a filing rail — VAT, CT600, Self Assessment, or payroll.",
      "Keep books in integer pence so every return draws from the same digital record. When you are ready, use prepare → review → submit. Fraud-prevention metadata is collected at the final step and blocked locally if incomplete.",
      "Without HMRC Developer Hub credentials you can still prepare and review locally. For live submits, store sandbox and production credentials in separate environments — Hydra refuses mixed keys.",
    ],
  },
  {
    slug: "add-clients-to-practice",
    title: "Adding clients to your practice",
    summary:
      "Limited companies, sole traders, and employers — which identifiers Hydra needs before you can file.",
    category: "getting-started",
    popular: true,
    body: [
      "From Clients → Add client, set the entity type and the refs you already hold: company number and UTR for CT600, VRN for VAT, NINO for Self Assessment, PAYE and Accounts Office refs for RTI.",
      "Flags for VAT-registered and employer unlock the matching module tabs. You can add identifiers later, but Hydra will block submit until the statutory fields for that rail are present.",
    ],
  },
  {
    slug: "ct600-submission-errors",
    title: "Fixing common CT600 submission errors",
    summary:
      "Authentication failures, invalid UTR, period conflicts, and business-logic rejections explained in plain language.",
    category: "troubleshooting",
    popular: true,
    body: [
      "If HMRC rejects authentication, confirm the company is enrolled for Corporation Tax Online and that the credentials match the UTR on the return.",
      "Invalid UTR almost always means a typo or a UTR that does not belong to that company number. Re-check both fields before rebuilding the XML.",
      "Business-logic failures usually mean the figures or period dates contradict HMRC’s records (overlapping periods, missing prior return, or schema rules for older periods). Adjust the period or mark an earlier period as filed elsewhere, then resubmit.",
    ],
  },
  {
    slug: "pending-hmrc-status",
    title: "Why a filing shows as pending with HMRC",
    summary:
      "What “pending” means after submit, how long to wait, and when to open a support ticket.",
    category: "troubleshooting",
    popular: true,
    body: [
      "Pending means the gateway accepted your payload and HMRC has not yet returned a final acceptance or rejection. This can take minutes or, at busy times, longer.",
      "Keep the correlation ID from Hydra’s audit trail. Do not submit a duplicate while the first request is still pending unless HMRC confirms there is no original return recorded.",
      "If the status stalls beyond a normal business day, contact Hydra support with the client name, period, and correlation ID.",
    ],
  },
  {
    slug: "hmrc-error-authentication",
    title: "HMRC authentication failure on CT600",
    summary:
      "Five usual causes — wrong credentials, CT not enrolled, expired session, mismatched UTR, or environment mix-up.",
    category: "troubleshooting",
    body: [
      "Reconnect the client’s HMRC authorisation from Settings → HMRC. Confirm you are on sandbox when testing and production only with live credentials.",
      "Enrol the company for Corporation Tax Online via Government Gateway if it has never filed electronically. Activation codes can take several days to arrive.",
      "Never paste sandbox client IDs into a production Hydra deployment — the platform blocks that bleed by design.",
    ],
  },
  {
    slug: "ct600-checklist",
    title: "CT600 filing checklist",
    summary:
      "What to gather before you open the Corporation Tax rail — periods, P&L, balance sheet, and prior filings.",
    category: "ct600",
    popular: true,
    body: [
      "Confirm the accounting period dates match Companies House and HMRC. Extended periods over twelve months usually need two CT600 submissions.",
      "Enter turnover, costs, and balance sheet figures in pounds and pence — Hydra stores them as integer pence and builds the XML payload for you.",
      "If an earlier period is overdue and filed elsewhere, mark it filed so the current period can proceed.",
    ],
  },
  {
    slug: "what-happens-after-ct600",
    title: "What happens after you submit a CT600",
    summary:
      "Acceptance receipts, audit entries, and how to prove the filing later.",
    category: "ct600",
    body: [
      "On acceptance, Hydra stores the processing response and correlation ID on the immutable audit log for that client.",
      "Download or screenshot the acceptance panel for your working papers. Tax due figures remain visible on the return record inside the client workspace.",
      "If HMRC later voids a return because period dates clash with their records, amend the dates and file again as instructed in the rejection letter.",
    ],
  },
  {
    slug: "previous-period-required",
    title: "Previous period required — unblock the current CT600",
    summary:
      "Why Hydra (and HMRC) insist on earlier periods first, and how to clear the blockage.",
    category: "ct600",
    body: [
      "HMRC expects Corporation Tax returns in chronological order. If an earlier open period exists, the current submit is blocked.",
      "Either file that earlier period in Hydra, or mark it as filed elsewhere if it was submitted through another channel.",
      "Only then reopen the current period and submit.",
    ],
  },
  {
    slug: "vat-from-books",
    title: "Drafting an MTD VAT return from books",
    summary:
      "How Hydra maps income and expense lines into the nine boxes, then guides review and submit.",
    category: "vat",
    popular: true,
    body: [
      "Enter income and expenses with the correct VAT rate on the Books tab. Hydra calculates VAT in integer pence.",
      "On the VAT rail, choose an open obligation, prepare the return, and review boxes before submit. Fraud-prevention headers are attached automatically at the last step.",
      "After acceptance, the form bundle number and processing date appear on the return history and in the audit trail.",
    ],
  },
  {
    slug: "reconnect-mtd-vat",
    title: "Reconnecting MTD for VAT when the link drops",
    summary:
      "Expired OAuth tokens, revoked grants, and how to re-authorise a client safely.",
    category: "vat",
    body: [
      "MTD links can expire or be revoked from the Government Gateway. Open the client workspace and use Connect HMRC (or reconnect) to run OAuth again.",
      "If credentials were rotated on the Developer Hub, update environment variables and restart — never mix sandbox and production secrets.",
      "A credential problem looks different from a validation error: reconnect first, then retry the return.",
    ],
  },
  {
    slug: "correct-vat-return",
    title: "Correcting a VAT return after submit",
    summary:
      "When you can amend, what Hydra stores, and how to keep the audit trail clean.",
    category: "vat",
    body: [
      "If HMRC accepted an incorrect return, follow HMRC’s amendment rules for the period. Prepare a corrected draft in Hydra and submit only when the gateway allows an amendment.",
      "Do not delete audit events — Hydra’s log is append-only so partners can see every attempt and response code.",
    ],
  },
  {
    slug: "sa-quarterly-update",
    title: "Submitting a Self Assessment quarterly update",
    summary:
      "Digital income and expense records from the ledger for sole traders and partners.",
    category: "self-assessment",
    popular: true,
    body: [
      "Self Assessment in Hydra is for sole traders and partnerships — limited companies use the Corporation Tax rail instead.",
      "Pick the tax year and period dates. Hydra totals turnover and expenses from books in that window, validates the payload, then submits with fraud-prevention headers.",
      "If the tax calculation looks higher than expected, check allowances (for example dividend nil-rate bands still consume basic-rate band) before amending figures.",
    ],
  },
  {
    slug: "proof-of-sa-filing",
    title: "Getting proof of a Self Assessment filing",
    summary:
      "Where to find correlation IDs and how they map to HMRC evidence for the file.",
    category: "self-assessment",
    body: [
      "Every SA submit writes a correlation ID and status into the client audit trail.",
      "Export or screenshot that entry for your working papers. For official SA302-style documents, continue to retrieve them from HMRC’s services once the year-end return is complete.",
    ],
  },
  {
    slug: "payroll-fps-payday",
    title: "Running payroll and submitting FPS on payday",
    summary:
      "Employees, monthly pay calculation, and Full Payment Submission from the client employer workspace.",
    category: "payroll",
    popular: true,
    body: [
      "Enable employer status and enter PAYE plus Accounts Office references before creating employees.",
      "Add employees with NINO, tax code, and annual salary. On payday, create a pay run — Hydra calculates PAYE and NI in pence and builds the FPS XML.",
      "Submit FPS on or before payday. Use EPS when there is no payment in a period so HMRC still receives the required notification.",
    ],
  },
  {
    slug: "eps-no-payment",
    title: "Sending an EPS when nobody was paid",
    summary:
      "When Employer Payment Summary is required and how to file it from Hydra.",
    category: "payroll",
    body: [
      "If a pay period has no employees paid, send an EPS with the no-payment indicator instead of inventing an FPS.",
      "Hydra’s payroll rail includes an EPS action for this case. Confirm the tax year and employer refs before submit.",
    ],
  },
  {
    slug: "fraud-prevention-headers",
    title: "Fraud-prevention headers — why submit can be blocked",
    summary:
      "Hydra refuses to call MTD APIs when browser metadata is incomplete.",
    category: "hmrc-connection",
    popular: true,
    body: [
      "UK law requires fraud-prevention headers on MTD VAT and Income Tax calls. Hydra collects fresh browser metadata at submit time — never from a stale cache.",
      "If anything is missing (timezone, screen metrics, local IPs, vendor fields), the request is blocked locally with a clear error before it reaches HMRC.",
      "Retry from a normal browser session; embedded previews or locked-down environments that hide device signals may need a full desktop browser.",
    ],
  },
  {
    slug: "sandbox-vs-production",
    title: "Sandbox vs production environments",
    summary:
      "How Hydra isolates test and live HMRC gateways so credentials never cross.",
    category: "hmrc-connection",
    body: [
      "Set HMRC_ENV to sandbox or production. API and auth base URLs are derived only from that flag.",
      "Production mode rejects credential strings that look like sandbox or mock keys. Rotate TOKEN_ENCRYPTION_KEY when moving from sandbox to live.",
    ],
  },
  {
    slug: "multi-client-deadlines",
    title: "Working the multi-client deadline board",
    summary:
      "How partners and juniors use the practice desk without losing filing context.",
    category: "practice",
    body: [
      "The dashboard lists upcoming VAT, SA, CT600, and payroll tasks. Click through to the client rail already scoped to that job.",
      "Search clients by name, VRN, or company number. Select a client to reveal only the modules that apply (for example no CT600 on a sole trader).",
      "Every mutation lands on the immutable audit trail so reviews stay partner-ready.",
    ],
  },
  {
    slug: "contact-hydratax-support",
    title: "How to contact Hydra support",
    summary:
      "What to include so we can resolve gateway and practice issues quickly.",
    category: "practice",
    popular: true,
    body: [
      "Email support with the practice name, client name, filing type, period dates, and any correlation ID or HTTP status from the audit trail.",
      "Describe whether you are on sandbox or production. Attach screenshots of the rejection panel when HMRC returns a business error code.",
      "For urgent payday FPS failures, mark the message as payroll-critical and include the pay date.",
    ],
  },
];

export function getArticle(slug: string) {
  return SUPPORT_ARTICLES.find((a) => a.slug === slug);
}

export function articlesByCategory(category: SupportCategoryId) {
  return SUPPORT_ARTICLES.filter((a) => a.category === category);
}

export function popularArticles() {
  return SUPPORT_ARTICLES.filter((a) => a.popular);
}

export function searchArticles(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return SUPPORT_ARTICLES;
  return SUPPORT_ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.body.some((p) => p.toLowerCase().includes(q)),
  );
}

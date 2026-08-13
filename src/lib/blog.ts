export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "callout"; text: string };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  category: string;
  relatedHref: string;
  relatedLabel: string;
  faq?: Array<{ q: string; a: string }>;
  body: BlogBlock[];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-use-payroll-at-hydratax",
    title: "How to run payroll at HydraTax",
    description:
      "A practical walkthrough of HydraTax PAYE: add employees, upload a timesheet, preview statutory sick, holiday, maternity and pension, submit FPS, and email a password-protected pack of payslips to the client.",
    keywords: [
      "HydraTax payroll guide",
      "how to run PAYE UK",
      "FPS RTI how to",
      "timesheet to payslips UK",
      "password protected payslips",
      "statutory sick pay 2026",
      "auto enrolment payroll",
    ],
    publishedAt: "2026-08-13",
    updatedAt: "2026-08-13",
    readingMinutes: 10,
    category: "Payroll",
    relatedHref: "/pricing#payroll",
    relatedLabel: "HydraTax PAYE / RTI pricing",
    faq: [
      {
        q: "Do I need a separate payroll login?",
        a: "No. Open the client in HydraTax, choose Payroll, and you are on the same desk as VAT, CT600 and Companies House.",
      },
      {
        q: "Can the client open the payslip zip without HydraTax?",
        a: "Yes. It is a standard password-protected zip. You set the password; tell the client that password by a separate channel.",
      },
    ],
    body: [
      {
        type: "p",
        text: "Payday should be a checklist, not a scramble between spreadsheets, HMRC and an inbox of Word payslips. This guide is the full HydraTax payroll path — from the first employee to a password-protected pack in the client’s inbox.",
      },
      {
        type: "h2",
        text: "1. Turn the client into an employer",
      },
      {
        type: "p",
        text: "Open the client and go to Payroll. If PAYE is not on yet, enter the PAYE reference and Accounts Office reference from the employer’s HMRC letter. HydraTax files FPS and EPS against those references. Without them, HMRC cannot match the submission.",
      },
      {
        type: "h2",
        text: "2. Add people (once)",
      },
      {
        type: "ul",
        items: [
          "Forename, surname, National Insurance number and tax code (1257L is the default).",
          "Starter declaration A, B or C — sent on the first FPS only, never again.",
          "Salary, or an hourly rate plus hours per week if you will upload timesheets.",
          "Leave payroll ID blank unless you already have one. HydraTax will not reuse an ID, including for leavers, because that splits the HMRC employment record.",
          "Tick opt-out only if the worker has actually opted out of auto-enrolment.",
        ],
      },
      {
        type: "h2",
        text: "3. Upload a timesheet if you pay by the hour",
      },
      {
        type: "p",
        text: "Download the Excel template from the Pay run screen. One row per employee. HydraTax matches on payroll ID, NI number or name. Columns it understands:",
      },
      {
        type: "ul",
        items: [
          "hours — ordinary hours this period; payslips are generated from hours × rate.",
          "overtime_hours — paid at the same hourly rate.",
          "sick_days — qualifying days of sickness. Statutory sick pay is calculated automatically.",
          "holiday_hours — paid at normal rate. For irregular-hours workers, tick irregular_hours to accrue 12.07% instead.",
          "maternity_weeks and maternity_week_from — week 1 of leave is the start of SMP.",
        ],
      },
      {
        type: "p",
        text: "Salaried staff with no timesheet row are still paid as a 1/12 or 1/52 split of annual salary. Mix both on the same run if you need to.",
      },
      {
        type: "h2",
        text: "4. What HydraTax calculates for 2026/27",
      },
      {
        type: "ul",
        items: [
          "Statutory sick pay — from day 1 of sickness, at the lower of £123.25 a week or 80% of average weekly earnings. Daily rate is that weekly figure divided by qualifying days (usually 5).",
          "Statutory maternity pay — 90% of average weekly earnings for the first six weeks (uncapped), then the lower of £194.32 or 90% of AWE for weeks 7–39. Average weekly earnings must be at least the Lower Earnings Limit (£129 a week) or SMP is not paid.",
          "Holiday pay — 5.6 weeks statutory. Irregular-hours workers accrue 12.07% of ordinary pay (5.6 ÷ 46.4). Named holiday hours are paid at the normal hourly rate.",
          "Workplace pension — auto-enrolment on qualifying earnings (£120–£967 a week, or £520–£4,189 a month). Employee 5%, employer 3%, unless the worker has opted out. Contributions use a net-pay arrangement (pension comes off before PAYE).",
        ],
      },
      {
        type: "callout",
        text: "Unusual tax codes, salary sacrifice and multi-job PAYE still need a sense-check against HMRC calculators. HydraTax is honest about that — it will not pretend to be a full bureau engine on day one.",
      },
      {
        type: "h2",
        text: "5. Preview, then submit FPS",
      },
      {
        type: "p",
        text: "Choose weekly (W1) or monthly (M1), set the period and payday, then Preview pay & checks. You will see gross, SSP/SMP, PAYE, NI, pension and net, plus year-to-date. Traffic-light checks block missing PAYE refs, reused payroll IDs and an empty run. Confirm only when the grid is right — that is the click that builds the Full Payment Submission and sends it to HMRC (or a demo receipt if you are in sandbox).",
      },
      {
        type: "p",
        text: "If nobody was paid this period, do not invent a zero FPS. Use Submit EPS — nobody paid.",
      },
      {
        type: "h2",
        text: "6. Print payslips or email a locked pack",
      },
      {
        type: "p",
        text: "History & packs lists each submitted run. Open a payslip in the browser to print. To send the whole month to the client, set a pack password (you choose it, at least eight characters) then Email protected pack or download the zip. The zip holds every payslip plus a payroll summary. Tell the client the password on a call or a separate message — not in the same email as the file.",
      },
      {
        type: "h2",
        text: "7. Leavers",
      },
      {
        type: "p",
        text: "Mark leaver with the leaving date. They appear on the final FPS with that date. Their payroll ID is retired. The next person you hire gets a new ID.",
      },
      {
        type: "callout",
        text: "That is the loop: people → timesheet if needed → preview → FPS or EPS → locked pack to the client. Same HydraTax client record as corporation tax and VAT.",
      },
    ],
  },
  {
    slug: "hydratax-payroll-vs-sage-xero-brightpay",
    title: "Why HydraTax is a better place to run UK payroll",
    description:
      "Most UK payroll tools file RTI. HydraTax is built around what still goes wrong: FPS with no preview, duplicate HMRC records, timesheets that never become payslips, and payroll living in a different login from CT600 and VAT.",
    keywords: [
      "best UK payroll software",
      "FPS RTI software UK",
      "payroll software for accountants UK",
      "payslips and RTI",
      "password protected payslips UK",
      "timesheet payroll software",
    ],
    publishedAt: "2026-08-13",
    updatedAt: "2026-08-13",
    readingMinutes: 8,
    category: "Payroll",
    relatedHref: "/pricing#payroll",
    relatedLabel: "HydraTax PAYE / RTI pricing",
    faq: [
      {
        q: "Is HydraTax enough for a small UK employer?",
        a: "For weekly or monthly FPS, payslips, EPS, timesheets, statutory sick/maternity/holiday, auto-enrolment and a locked pack to the client — yes, and it sits next to CT600, MTD VAT and Companies House. Complex salary-sacrifice schemes should still be checked against HMRC calculators.",
      },
      {
        q: "Does HydraTax file RTI to HMRC?",
        a: "Yes. Each confirmed pay run builds a Full Payment Submission (FPS). If nobody was paid, you send an Employer Payment Summary (EPS) instead.",
      },
    ],
    body: [
      {
        type: "p",
        text: "HMRC recognition is table stakes. Every serious UK payroll product can send an FPS. The reason firms still hate payday is everything around that click: a second login, per-head fees, no preview, and a tiny data mistake that creates a duplicate employment on HMRC.",
      },
      {
        type: "h2",
        text: "What we designed HydraTax around",
      },
      {
        type: "h3",
        text: "1. FPS goes out before anyone has checked the numbers",
      },
      {
        type: "p",
        text: "HydraTax splits preview and submit. You see gross, PAYE, NI, statutory pay, pension and year-to-date, with traffic-light checks, then a second confirm to submit the FPS. That is how you stop a wrong starter declaration leaving the building.",
      },
      {
        type: "h3",
        text: "2. Duplicate HMRC employments",
      },
      {
        type: "p",
        text: "HMRC’s employer bulletins keep blaming reused payroll IDs, missing “payroll ID changed” indicators, and start dates on continuing staff. We refuse to issue a duplicate payroll ID (including leavers), we only send starter declarations on the first FPS, and we keep year-to-date tax and pay on the submission so a nil-looking period does not merge records.",
      },
      {
        type: "h3",
        text: "3. Timesheets that never become payslips",
      },
      {
        type: "p",
        text: "Upload one Excel sheet. Hours, sick days, holiday and maternity weeks become payslips automatically — using 2026/27 HMRC rates for statutory sick pay (from day 1), maternity pay, 5.6 weeks’ holiday and auto-enrolment qualifying earnings. No re-keying into a second product.",
      },
      {
        type: "h3",
        text: "4. Payslips stuck in the practice inbox",
      },
      {
        type: "p",
        text: "Accountants set the pack password themselves. HydraTax emails the client a password-protected zip of every payslip plus a period summary. Print remains one click if you still want paper.",
      },
      {
        type: "h3",
        text: "5. Weekly and monthly are first-class",
      },
      {
        type: "p",
        text: "Retail and hospitality pay weekly; offices pay monthly. HydraTax is a frequency switch: M1 or W1 on the FPS, period dates filled in, payday called out because RTI is due on or before that date.",
      },
      {
        type: "h3",
        text: "6. Payroll is an island elsewhere",
      },
      {
        type: "p",
        text: "Your limited company still needs a CT600, often MTD VAT, a confirmation statement and year-end accounts. Paying extra per employee inside a ledger that cannot file those returns is how practices end up with five subscriptions. HydraTax is one client record, one desk.",
      },
      {
        type: "h3",
        text: "7. Nobody paid — now what?",
      },
      {
        type: "p",
        text: "A quiet month still needs an EPS with the no-payment indicator. Inventing a zero FPS is how HMRC records go strange. The payroll screen offers “Submit EPS — nobody paid” as a first-class action.",
      },
      {
        type: "h2",
        text: "Where we are still careful",
      },
      {
        type: "p",
        text: "The PAYE/NI engine is integer-pence and aimed at salaried and hourly weekly/monthly staff. Unusual tax codes, salary sacrifice and multi-job PAYE schemes should be checked against HMRC calculators. We would rather say that than pretend a full CIPP-grade engine on day one.",
      },
      {
        type: "h2",
        text: "Who it is for",
      },
      {
        type: "ul",
        items: [
          "Accountants who already want CT600, VAT and Companies House in one place and are tired of a bolt-on payroll login.",
          "Directors with a handful of staff who need FPS, timesheets, statutory pay, payslips and a quiet-month EPS.",
          "Anyone who has already created a duplicate employment and never wants to do it again through a reused payroll ID.",
        ],
      },
      {
        type: "callout",
        text: "Open a client, add employees, upload hours if you have them, preview the run, submit FPS or EPS, send a locked pack. Same HydraTax desk as the rest of UK compliance — that is the difference, not another logo on an HMRC recognition list.",
      },
    ],
  },
  {
    slug: "challenges-facing-uk-accountants",
    title: "The biggest challenges facing UK accountants in 2026",
    description:
      "Staff shortages, HMRC digital change, Companies House identity checks and client bookkeeping gaps — how UK practices can stay on top of accounting work without drowning in portals.",
    keywords: [
      "challenges facing accountants UK",
      "accounting practice problems 2026",
      "accountant software UK",
      "practice management for accountants",
      "HMRC filing for accountants",
      "small accountancy firm challenges",
    ],
    publishedAt: "2026-08-13",
    updatedAt: "2026-08-13",
    readingMinutes: 8,
    category: "Practice",
    relatedHref: "/pricing",
    relatedLabel: "See HydraTax practice plans",
    faq: [
      {
        q: "What is the hardest part of running a small UK accountancy firm right now?",
        a: "Most practices cite the same mix: keeping up with HMRC and Companies House change, chasing incomplete client records, and switching between too many filing portals for VAT, CT600, payroll and confirmation statements.",
      },
      {
        q: "Can software replace an accountant?",
        a: "No. Good software removes re-keying and deadline chasing so accountants can spend time on judgement, tax planning and client advice — not copying figures between systems.",
      },
    ],
    body: [
      {
        type: "p",
        text: "UK accountants are not short of work. They are short of time, clean data and a single place to file. Limited companies, landlords and sole traders now expect digital filing, faster answers and a lower bill — while HMRC, Companies House and payroll rules keep moving.",
      },
      {
        type: "p",
        text: "If you run a small practice — or you are a director who still does your own books — these are the pressures showing up on every desk in 2026, and what actually helps.",
      },
      {
        type: "h2",
        text: "Too many government portals for one client",
      },
      {
        type: "p",
        text: "A typical limited company still needs MTD VAT (if registered), a CT600 and iXBRL accounts, a confirmation statement, PAYE RTI if it has staff, and sometimes Self Assessment for the director. Each has its own login, deadline and error message. Accountants lose hours logging in, downloading PDFs and re-typing the same company number.",
      },
      {
        type: "p",
        text: "The practical fix is one client record that carries HMRC and Companies House work together — not five bookmarks and a spreadsheet of passwords.",
      },
      {
        type: "h2",
        text: "Client records arrive late, messy or incomplete",
      },
      {
        type: "p",
        text: "Bank CSVs with no categories, missing invoices, directors who mix personal and company spend, and year-end “we’ll send it next week” are still the biggest time thieves. The accounting challenge is rarely the tax computation. It is reconstructing a year from fragments.",
      },
      {
        type: "ul",
        items: [
          "Ask for bank exports early, not in week 50 of the accounting period.",
          "Agree a simple chart of categories the client can actually use.",
          "File VAT and payroll through the year so year-end is a check, not an excavation.",
        ],
      },
      {
        type: "h2",
        text: "Digital tax rules keep changing — even when “MTD for CT” does not arrive",
      },
      {
        type: "p",
        text: "Making Tax Digital for VAT is already compulsory. Making Tax Digital for Income Tax is rolling out for qualifying self-employed people and landlords. Making Tax Digital for Corporation Tax, as originally consulted on, is not being introduced. That does not mean corporation tax is “unchanged”: HMRC closed its free joint online CT600 service, so most companies now need commercial software to file.",
      },
      {
        type: "p",
        text: "Practices that still treated CT600 as a once-a-year government website job now have a software and process problem, not just a tax one.",
      },
      {
        type: "h2",
        text: "Companies House identity verification",
      },
      {
        type: "p",
        text: "Directors and people with significant control must verify identity. Confirmation statements and incorporations now need personal codes. Accountants are being asked to explain GOV.UK One Login, ACSPs and why a filing was rejected for a missing code. That is extra client education on top of the accounts.",
      },
      {
        type: "h2",
        text: "People, not just software",
      },
      {
        type: "p",
        text: "Qualified staff are expensive and hard to hire. Junior time is burned on data entry that software should have done. The firms that stay profitable are the ones that standardise: same checklist per client, same filing desk, same place to see what is overdue.",
      },
      {
        type: "callout",
        text: "HydraTax is built as a practice desk: CT600, MTD VAT, Self Assessment, PAYE and Companies House in one UK product — so the challenge is the advice, not the login.",
      },
      {
        type: "h2",
        text: "What to do this month",
      },
      {
        type: "ul",
        items: [
          "List every client’s next VAT, CT, payroll and confirmation statement date in one view.",
          "Move CT600 filing off any leftover free-service habit onto recognised software.",
          "Collect director personal codes before the confirmation statement is due, not on the deadline day.",
          "Stop re-keying bank and trial balance figures into separate tools if one workspace can take them through to a return.",
        ],
      },
    ],
  },
  {
    slug: "bookkeeping-difficulties-for-small-businesses",
    title: "Bookkeeping difficulties for small businesses (and how to fix them)",
    description:
      "Why UK small businesses struggle with bookkeeping — mixed personal spend, missing receipts, VAT categories and year-end panic — and a practical way to keep records HMRC-ready.",
    keywords: [
      "bookkeeping difficulties small business UK",
      "small business bookkeeping problems",
      "bookkeeping for limited company",
      "VAT bookkeeping UK",
      "bank reconciliation small business",
      "accounting for startups UK",
    ],
    publishedAt: "2026-08-13",
    updatedAt: "2026-08-13",
    readingMinutes: 7,
    category: "Small business",
    relatedHref: "/pricing#vat",
    relatedLabel: "File MTD VAT with HydraTax",
    faq: [
      {
        q: "Do I need a bookkeeper if I have a limited company?",
        a: "You need accurate records. That can be you, a bookkeeper or an accountant — but HMRC and Companies House still expect complete figures. Software helps; it does not excuse missing invoices.",
      },
      {
        q: "What is the most common bookkeeping mistake?",
        a: "Treating the business bank account as a personal wallet, then trying to untangle drawings, expenses and VAT at year end.",
      },
    ],
    body: [
      {
        type: "p",
        text: "Most small-business bookkeeping problems are not “I don’t understand double entry”. They are everyday habits: receipts in a carrier bag, Amazon orders mixed with stock, the director paying a supplier on a personal card, and a VAT return completed from memory.",
      },
      {
        type: "p",
        text: "HMRC’s Making Tax Digital rules for VAT already expect digital records and software filing. Even if you are not VAT registered, Companies House accounts and the CT600 still need a clean year of numbers. Messy books cost more in accountant time than any software subscription.",
      },
      {
        type: "h2",
        text: "The difficulties we see every week",
      },
      {
        type: "h3",
        text: "1. Personal and business money in one pot",
      },
      {
        type: "p",
        text: "A limited company is a separate legal person. Paying the weekly shop from the company account, or putting stock on a personal card and never recording it, distorts profit, VAT and director’s loan accounts. Open a dedicated business account and record director drawings properly.",
      },
      {
        type: "h3",
        text: "2. No categories until year end",
      },
      {
        type: "p",
        text: "A bank statement that only says “CARD PAYMENT 49.99” is not a set of accounts. You need a simple list: sales, materials, subcontractors, motor, insurance, bank charges, drawings. Categorise as you go — monthly is enough for most micro-entities.",
      },
      {
        type: "h3",
        text: "3. VAT on the wrong boxes",
      },
      {
        type: "p",
        text: "Standard-rated sales, zero-rated goods, reverse charges and the Flat Rate Scheme all land in different VAT boxes. Guessing at the deadline is how businesses overpay or underpay. Keep a running VAT workbook or software that maps each bank line to a box.",
      },
      {
        type: "h3",
        text: "4. Missing purchase invoices",
      },
      {
        type: "p",
        text: "You cannot claim input VAT or a corporation-tax deduction on a cost you cannot evidence. Photograph invoices the day they arrive. Match them to the bank line. If a supplier only emails a payment link, save the confirmation.",
      },
      {
        type: "h3",
        text: "5. Leaving it all for the accountant in month 12",
      },
      {
        type: "p",
        text: "Year-end then becomes forensic reconstruction. That is slow, expensive and more likely to miss allowable costs. A 30-minute monthly tidy beats a two-week panic in January.",
      },
      {
        type: "h2",
        text: "A bookkeeping routine that actually sticks",
      },
      {
        type: "ul",
        items: [
          "Export the business bank CSV every month (or connect the feed if you use one).",
          "Tag each line: income, expense category, VAT rate, or director drawing.",
          "File VAT from those tagged figures — do not invent box 1 and box 4 from a calculator.",
          "Keep a folder of PDFs named by date and supplier.",
          "At year end, roll the same categories into accounts and CT600 rather than starting again.",
        ],
      },
      {
        type: "callout",
        text: "HydraTax can take a bank export through categorisation into year-end figures and MTD VAT boxes — so small companies are not maintaining three different spreadsheets.",
      },
      {
        type: "h2",
        text: "When to get help",
      },
      {
        type: "p",
        text: "Get an accountant involved before you register for VAT, take on employees, or close a year with mixed personal spend. Bookkeeping difficulties compound; they rarely shrink on their own. The goal is not perfect ledgers. It is records you could show HMRC without reconstructing a year from emails.",
      },
    ],
  },
  {
    slug: "hmrc-ct600-regulation-changes",
    title: "Changing HMRC rules on CT600: what limited companies must do now",
    description:
      "HMRC closed free online CT600 filing on 31 March 2026. MTD for Corporation Tax is not going ahead. Here is what actually changed for Company Tax Returns, iXBRL accounts and software.",
    keywords: [
      "CT600 changes 2026",
      "HMRC CT600 commercial software",
      "file CT600 online",
      "corporation tax return UK",
      "HMRC free CT600 service closed",
      "iXBRL corporation tax",
      "Company Tax Return software",
    ],
    publishedAt: "2026-08-13",
    updatedAt: "2026-08-13",
    readingMinutes: 8,
    category: "Corporation tax",
    relatedHref: "/pricing#ct600",
    relatedLabel: "File a CT600 with HydraTax",
    faq: [
      {
        q: "Is Making Tax Digital coming for Corporation Tax in 2026?",
        a: "No. HMRC’s July 2025 Transformation Roadmap said it does not intend to introduce MTD for Corporation Tax. Companies still file one annual CT600 — but usually through commercial software, not HMRC’s old free website.",
      },
      {
        q: "Can I still file a CT600 for free on GOV.UK?",
        a: "The joint HMRC / Companies House online filing service closed on 31 March 2026. From 1 April 2026 most companies need recognised commercial software to send the Company Tax Return.",
      },
    ],
    body: [
      {
        type: "p",
        text: "If you have been searching for “new CT600 regulations”, you will find two stories mixed together. One is true: the way you send a Company Tax Return to HMRC changed in 2026. The other is not: Making Tax Digital for Corporation Tax is not a live mandate, and HMRC has said it does not intend to introduce it in the form originally consulted on.",
      },
      {
        type: "h2",
        text: "What did not change",
      },
      {
        type: "ul",
        items: [
          "You still file a CT600 for each Corporation Tax accounting period (no longer than 12 months).",
          "You still pay Corporation Tax nine months and one day after the period ends (for most companies).",
          "You still file the return within 12 months of the period end.",
          "There are no quarterly MTD-style updates for Corporation Tax.",
        ],
      },
      {
        type: "h2",
        text: "What did change: the free filing route closed",
      },
      {
        type: "p",
        text: "On 31 March 2026 HMRC closed the free online service that many small companies used to file accounts and a Company Tax Return together. From 1 April 2026, sending a CT600 generally means using commercial software that can talk to HMRC’s Corporation Tax Online service (XML / iXBRL), unless a rare paper exception applies.",
      },
      {
        type: "p",
        text: "A complete software submission is still the familiar package: the CT600 return, a Corporation Tax computation in iXBRL, and accounts in iXBRL where required. Companies House accounts remain a separate filing with their own routes and fees.",
      },
      {
        type: "h2",
        text: "Rates, associated companies and computations still matter",
      },
      {
        type: "p",
        text: "The filing channel changed; the tax calculation did not go away. Companies still need the right period dates, the small profits and main rates where they apply, associated-company counts, capital allowances (including full expensing where available), and any R&D or other reliefs on the correct supplementary pages. HMRC will still query a return that does not hang together.",
      },
      {
        type: "h2",
        text: "Identity, agents and who can file",
      },
      {
        type: "p",
        text: "Directors must keep Companies House identity verification in order. That does not replace the CT600, but a practice that files both corporation tax and confirmation statements needs the client’s personal codes and HMRC credentials in one place. Agents filing for clients should keep Government Gateway / agent services organised before the deadline, not on it.",
      },
      {
        type: "callout",
        text: "HydraTax prepares and files CT600 packages through HMRC-ready software so you are not dependent on a closed GOV.UK form. Always check the latest GOV.UK guidance for rates and reliefs before you submit.",
      },
      {
        type: "h2",
        text: "A short checklist for the next CT600",
      },
      {
        type: "ul",
        items: [
          "Confirm the accounting period dates with Companies House and HMRC.",
          "Lock a trial balance or tagged bank year-end so the iXBRL accounts and CT computation use the same figures.",
          "Use commercial CT software — not a screenshot of last year’s PDF.",
          "Keep the computation, accounts and CT600 together as one submission.",
          "Diary the payment date separately from the filing date; they are not the same.",
        ],
      },
      {
        type: "p",
        text: "HMRC may still modernise corporation-tax administration in future. Until it publishes a new regime with dates, treat the annual CT600 as the live obligation — and treat software filing as the live method.",
      },
    ],
  },
  {
    slug: "what-is-making-tax-digital",
    title: "What is Making Tax Digital (MTD)?",
    description:
      "A plain-English guide to Making Tax Digital in the UK: MTD for VAT, MTD for Income Tax from April 2026, and why MTD for Corporation Tax is not going ahead.",
    keywords: [
      "what is Making Tax Digital",
      "MTD VAT UK",
      "Making Tax Digital for Income Tax",
      "MTD ITSA 2026",
      "Making Tax Digital software",
      "digital record keeping HMRC",
      "MTD for small business",
    ],
    publishedAt: "2026-08-13",
    updatedAt: "2026-08-13",
    readingMinutes: 8,
    category: "HMRC",
    relatedHref: "/pricing#vat",
    relatedLabel: "File MTD VAT returns",
    faq: [
      {
        q: "What is Making Tax Digital in one sentence?",
        a: "Making Tax Digital is HMRC’s programme that requires certain taxpayers to keep digital records and send returns using compatible software instead of typing figures into a website.",
      },
      {
        q: "Does MTD apply to my limited company’s Corporation Tax?",
        a: "MTD for Corporation Tax is not being introduced. You still file an annual CT600, usually via commercial software. MTD does apply to VAT if you are VAT-registered, and may apply to you personally if you have self-employment or property income above the MTD for Income Tax thresholds.",
      },
    ],
    body: [
      {
        type: "p",
        text: "Making Tax Digital (MTD) is HMRC’s long-running programme to move tax from paper and website forms onto software. The idea is simple: keep records digitally, then submit them through a recognised product so HMRC receives structured data, not a retyped summary.",
      },
      {
        type: "p",
        text: "In practice MTD is three different stories — VAT, Income Tax, and Corporation Tax — and mixing them up is how directors get the wrong advice.",
      },
      {
        type: "h2",
        text: "MTD for VAT (already live)",
      },
      {
        type: "p",
        text: "If you are VAT-registered, you must keep digital VAT records and file VAT returns using MTD-compatible software. That has been the default for VAT-registered businesses for years. You connect the software to HMRC, pull the period, send the nine boxes, and keep a digital audit trail.",
      },
      {
        type: "ul",
        items: [
          "Do not file a VAT return by typing into the old online form if you are in MTD.",
          "Your software must store the figures digitally (spreadsheets can qualify if used correctly; most firms use dedicated products).",
          "Agent and business connections are different — accountants need the right HMRC authorisation.",
        ],
      },
      {
        type: "h2",
        text: "MTD for Income Tax (rolling out)",
      },
      {
        type: "p",
        text: "Making Tax Digital for Income Tax Self Assessment (often called MTD ITSA) is rolling out from April 2026 for people with qualifying self-employment and/or property income above HMRC’s published thresholds (starting with higher incomes, then stepping down in later years). Those in scope keep digital records and send updates through software, not only a once-a-year SA100 typed by hand.",
      },
      {
        type: "p",
        text: "Company directors are not “in MTD for CT”. They may still be in MTD for Income Tax if they have a side trade or residential property income in their own name. Check GOV.UK for the current thresholds and start dates — HMRC has adjusted them before.",
      },
      {
        type: "h2",
        text: "MTD for Corporation Tax (not going ahead)",
      },
      {
        type: "p",
        text: "HMRC consulted on Making Tax Digital for Corporation Tax years ago. In its July 2025 Transformation Roadmap it said it does not intend to introduce MTD for CT. Limited companies continue to file one annual Company Tax Return. What did change is the filing pipe: the free joint online service closed, so commercial CT software is now the normal route.",
      },
      {
        type: "h2",
        text: "What “compatible software” means",
      },
      {
        type: "p",
        text: "HMRC publishes lists of software that can connect to its APIs. Compatible does not mean “any app with a PDF export”. It means the product can authenticate, send the right XML or API payload, and handle errors HMRC sends back. That is why practices standardise on a desk that already speaks VAT, CT and payroll rather than a patchwork of tools.",
      },
      {
        type: "callout",
        text: "HydraTax is built around HMRC digital filing: MTD VAT returns, CT600 software filing, Self Assessment and PAYE RTI from one UK practice workspace.",
      },
      {
        type: "h2",
        text: "How to prepare if you are a small company",
      },
      {
        type: "ul",
        items: [
          "If VAT-registered: file every return through MTD software and keep the workings.",
          "If you have self-employment or property income: check whether MTD for Income Tax applies to you personally.",
          "For the company CT600: use commercial software and iXBRL accounts — do not wait for a “quarterly CT MTD” that is not coming.",
          "Keep bank records digital through the year so any MTD obligation is a submit step, not a reconstruction.",
        ],
      },
    ],
  },
  {
    slug: "what-is-a-confirmation-statement",
    title: "What is a confirmation statement — and why you must file it",
    description:
      "A confirmation statement (CS01) is a yearly Companies House filing that confirms your company’s details are correct. Miss it and the company can be struck off. How to file, fees, personal codes and deadlines.",
    keywords: [
      "what is a confirmation statement",
      "confirmation statement Companies House",
      "file CS01 online",
      "confirmation statement due date",
      "why file confirmation statement",
      "Companies House annual confirmation",
      "CS01 personal code",
    ],
    publishedAt: "2026-08-13",
    updatedAt: "2026-08-13",
    readingMinutes: 7,
    category: "Companies House",
    relatedHref: "/companies-house/confirmation-statement",
    relatedLabel: "File a confirmation statement",
    faq: [
      {
        q: "Is a confirmation statement the same as annual accounts?",
        a: "No. Accounts show the company’s financial position. A confirmation statement confirms statutory details — officers, registered office, SIC codes, share capital and people with significant control — and that the company still exists.",
      },
      {
        q: "What happens if I do not file a confirmation statement?",
        a: "Companies House can prosecute officers and may strike the company off the register. That can freeze the bank account and lose limited-liability protection. File as soon as you can if you are late.",
      },
    ],
    body: [
      {
        type: "p",
        text: "A confirmation statement is the yearly filing that tells Companies House: this company is still here, and the details on the public register are correct (or here are the updates). It replaced the old annual return. Most UK limited companies must deliver one at least once every 12 months.",
      },
      {
        type: "p",
        text: "It is not your accounts and it is not your CT600. You can be up to date with HMRC and still be struck off if you ignore the confirmation statement.",
      },
      {
        type: "h2",
        text: "What you are confirming",
      },
      {
        type: "ul",
        items: [
          "The registered office and (where required) registered email address.",
          "Directors and secretaries — and, for new filings, identity verification / personal codes.",
          "People with significant control (PSCs) and the nature of their control.",
          "SIC codes (what the company does).",
          "Share capital and shareholder information where it applies.",
          "A statement that the company’s intended activities are lawful.",
        ],
      },
      {
        type: "h2",
        text: "Why filing it is necessary",
      },
      {
        type: "p",
        text: "Companies House is a public register. Lenders, customers, HMRC and buyers rely on it. The confirmation statement is how the law keeps that register from going stale. If you do not file:",
      },
      {
        type: "ul",
        items: [
          "The company can be struck off. Bank accounts are often closed. Contracts become messy.",
          "Directors can face late-filing consequences and, in serious cases, prosecution.",
          "Restoring a struck-off company is slower and more expensive than filing on time.",
          "You may also be out of date for identity verification, which blocks later filings.",
        ],
      },
      {
        type: "h2",
        text: "When it is due",
      },
      {
        type: "p",
        text: "Your review period usually runs 12 months from incorporation (or from the last confirmation date). You can file early if you need to update the register, which starts a new 12-month period. File by the due date shown on the company’s Companies House record — do not guess.",
      },
      {
        type: "h2",
        text: "What you need in order to file",
      },
      {
        type: "ul",
        items: [
          "The company authentication code from Companies House.",
          "An 11-character personal code for each director who must verify identity (from GOV.UK One Login or an ACSP).",
          "Up-to-date officer, PSC, SIC and share details.",
          "The statutory filing fee plus any software or agent charge.",
        ],
      },
      {
        type: "p",
        text: "Personal codes are not optional extras on modern CS01 filings. If a director has not verified identity, get that done before you try to submit — the form will not save you.",
      },
      {
        type: "callout",
        text: "HydraTax looks up the company on the public register, then walks you through authentication code, director personal codes and payment so the confirmation statement can go to Companies House in one sitting.",
      },
      {
        type: "h2",
        text: "Confirmation statement vs accounts vs CT600",
      },
      {
        type: "p",
        text: "Think of three clocks. Companies House wants accounts (financial statements) and a confirmation statement (register details). HMRC wants a CT600 (corporation tax). Missing any one of them is a problem. Filing all three from one desk is how small companies stop dropping the CS01 because they thought “we already sent the accounts”.",
      },
    ],
  },
];

export function getBlogPost(slug: string) {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}

export function blogSlugs() {
  return BLOG_POSTS.map((p) => p.slug);
}

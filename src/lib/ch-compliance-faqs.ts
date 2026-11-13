/**
 * UK Companies House / corporate compliance FAQs for founders, directors and accountants.
 * Facts aligned to GOV.UK Companies House guidance and HMRC practice (ECCTA era).
 * HydraTax CTAs point at live product routes — not legal advice.
 */

export type ChFaqLink = { label: string; href: string };

export type ChComplianceFaq = {
  q: string;
  /** Direct summary answer */
  a: string;
  /** Process / deadlines / forms */
  steps?: string[];
  fees?: string;
  pitfalls?: string[];
  sources?: ChFaqLink[];
  hydra?: ChFaqLink[];
};

export type ChComplianceSection = {
  id: string;
  title: string;
  intro: string;
  items: ChComplianceFaq[];
};

const GOV = {
  findCompany: "https://find-and-update.company-information.service.gov.uk/",
  authCode:
    "https://www.gov.uk/guidance/company-authentication-codes-for-online-filing",
  verifyId:
    "https://www.gov.uk/guidance/verify-your-identity-for-companies-house",
  personalCode:
    "https://www.gov.uk/guidance/companies-house-personal-codes-for-identity-verification",
  acsp: "https://www.gov.uk/guidance/register-as-an-authorised-corporate-service-provider",
  registeredOffice:
    "https://www.gov.uk/guidance/registered-office-address-requirements",
  registeredEmail:
    "https://www.gov.uk/guidance/registered-email-address-for-your-company",
  strikeOff:
    "https://www.gov.uk/government/publications/company-strike-off-dissolution-and-restoration",
  closeCompany: "https://www.gov.uk/closing-a-limited-company",
  restore:
    "https://www.gov.uk/guidance/company-restoration-guide",
  cs01Guide:
    "https://www.gov.uk/guidance/filing-your-companys-confirmation-statement",
  cs01File:
    "https://www.gov.uk/file-your-confirmation-statement-with-companies-house",
  fees: "https://www.gov.uk/government/publications/companies-house-fees/companies-house-fees",
  accountsLife:
    "https://www.gov.uk/government/publications/filing-your-companies-house-accounts/life-of-a-company-part-1-accounts",
  latePenalties:
    "https://www.gov.uk/government/publications/late-filing-penalties-from-companies-house/late-filing-penalties",
  aa02: "https://www.gov.uk/government/publications/file-your-dormant-accounts-aa02",
  incorporate: "https://www.gov.uk/limited-company-formation",
  companyNames: "https://www.gov.uk/government/publications/incorporation-and-names",
  psc: "https://www.gov.uk/guidance/people-with-significant-control-pscs",
  ctRegister: "https://www.gov.uk/corporation-tax",
} as const;

export const CH_COMPLIANCE_SECTIONS: ChComplianceSection[] = [
  {
    id: "general",
    title: "General Companies House & identity verification",
    intro:
      "Find companies, authentication codes, ECCTA identity verification, registered office/email, strike-off and dissolution.",
    items: [
      {
        q: "How do I find a company’s registration number or check its status?",
        a: "Use the official Companies House “Find and update company information” service. Search by name or number to see status (active, dissolved, proposal to strike off), incorporation date, filing history, officers and Persons with Significant Control (PSCs).",
        steps: [
          "Open Find and update company information on GOV.UK.",
          "Search by company name or 8-character company number.",
          "Open the company profile to check status, due dates and filing history.",
        ],
        sources: [{ label: "Find and update company information", href: GOV.findCompany }],
        hydra: [
          { label: "Search any UK company on HydraTax", href: "/companies" },
          {
            label: "Companies House filing hub",
            href: "/companies-house",
          },
        ],
      },
      {
        q: "How do I request a lost or forgotten Companies House authentication code?",
        a: "The company authentication code is the Companies House “password” for online / software filing. If lost, request a new code from Companies House; they send it to the registered office (or follow the current GOV.UK recovery process).",
        steps: [
          "Go to Companies House guidance on company authentication codes.",
          "Request a new code for the company number you control.",
          "Wait for delivery to the registered office (or complete any online identity steps Companies House requires).",
          "Store the code securely — anyone with it can file for the company.",
        ],
        pitfalls: [
          "Do not share the authentication code casually; treat it like a bank password.",
          "If the registered office is a virtual address that does not forward post reliably, you may not receive a reissued code.",
        ],
        sources: [
          { label: "Company authentication codes", href: GOV.authCode },
        ],
        hydra: [
          {
            label: "File a confirmation statement (auth code required)",
            href: "/companies-house/confirmation-statement",
          },
          { label: "Create a HydraTax account to store filings", href: "/create-account" },
        ],
      },
      {
        q: "How do I verify my identity as a director or Person with Significant Control (PSC), and what is a Companies House personal code?",
        a: "Under the Economic Crime and Corporate Transparency Act framework, directors and PSCs must verify identity with Companies House. After successful verification you receive an 11-character Companies House personal code, personal to you (not the company). You reuse the same code for every role.",
        steps: [
          "Verify via the official GOV.UK “Verify your identity for Companies House” service (GOV.UK One Login), or through an Authorised Corporate Service Provider (ACSP).",
          "After success, obtain your 11-character personal code (Companies House account → Manage account, or email depending on route).",
          "Directors: supply the code on the next confirmation statement (from 18 November 2025) or on appointment / incorporation if newly appointed.",
          "PSCs: provide the code within the statutory window that applies to your situation (see GOV.UK “when to verify”).",
        ],
        pitfalls: [
          "Companies House will not accept a confirmation statement until all current directors have verified and provided personal codes.",
          "Do not post or email passports to Companies House — only One Login or an ACSP.",
          "One verification covers multiple companies; you do not get a new code per company.",
        ],
        sources: [
          { label: "Verify your identity", href: GOV.verifyId },
          { label: "Personal codes", href: GOV.personalCode },
        ],
        hydra: [
          {
            label: "HydraTax guide: verify identity & personal codes",
            href: "/blog/how-to-verify-identity-companies-house",
          },
          {
            label: "Personal codes explained",
            href: "/companies-house/personal-code",
          },
          {
            label: "File CS01 with director personal codes",
            href: "/companies-house/confirmation-statement",
          },
        ],
      },
      {
        q: "What is an Authorised Corporate Service Provider (ACSP), and do I need one?",
        a: "An ACSP is a supervised professional (for example an accountant or solicitor) registered with Companies House to carry out identity verification and certain filings for clients. You do not need an ACSP if you verify yourself with GOV.UK One Login; you may use one if you prefer an agent, lack suitable ID for the online route, or want a firm to manage verification.",
        steps: [
          "Decide: self-verify with One Login (free) or ask a registered ACSP.",
          "If using an ACSP, they verify you and Companies House emails your personal code to the address they supply.",
          "Save the code into a Companies House account for future filings.",
        ],
        sources: [{ label: "Register as an ACSP", href: GOV.acsp }],
        hydra: [
          {
            label: "Practice desk for accountants (multi-client filing)",
            href: "/pricing#practice",
          },
          { label: "Book a demo", href: "/book-demo" },
        ],
      },
      {
        q: "How do I change my company's registered office address or registered email address?",
        a: "File the appropriate change with Companies House. The registered office must be an “appropriate address” where documents can be delivered and acknowledged. Companies must also maintain a registered email address so Companies House can contact the company electronically (ECCTA reforms).",
        steps: [
          "Choose an appropriate UK registered office (not a PO Box-only arrangement that fails the legal tests).",
          "File the registered office change online / via software (or paper AD01 where still applicable).",
          "Update the registered email address through Companies House services when required.",
          "Keep both details current — Companies House uses them for official notices.",
        ],
        pitfalls: [
          "An inappropriate registered office can lead to Companies House action and filing problems.",
          "Changing address does not by itself update HMRC Corporation Tax correspondence — update HMRC separately where needed.",
        ],
        sources: [
          { label: "Registered office requirements", href: GOV.registeredOffice },
          { label: "Registered email address", href: GOV.registeredEmail },
        ],
        hydra: [
          { label: "Search your company profile", href: "/companies" },
          { label: "Companies House services", href: "/companies-house" },
        ],
      },
      {
        q: "What does “active proposal to strike off” mean, and how do I stop it?",
        a: "It means Companies House has started the process to remove the company from the register (often for non-filing, or after a voluntary DS01 application). If the company should remain active, you must stop the strike-off (for example by filing overdue accounts / confirmation statement, or objecting / withdrawing as the guidance for that route requires) before dissolution completes.",
        steps: [
          "Check the company status on the public register and read the Gazette / Companies House notices.",
          "Identify why strike-off was proposed (compulsory for non-compliance vs voluntary DS01).",
          "Bring filings up to date and follow GOV.UK steps to stop or object to strike-off before the company is dissolved.",
        ],
        pitfalls: [
          "Once dissolved, bank accounts freeze and the company cannot trade; restoration is slower and costlier than preventing strike-off.",
        ],
        sources: [
          { label: "Strike off, dissolution and restoration", href: GOV.strikeOff },
        ],
        hydra: [
          { label: "Check status on HydraTax company search", href: "/companies" },
          {
            label: "File overdue confirmation statement",
            href: "/companies-house/confirmation-statement",
          },
          {
            label: "File annual accounts",
            href: "/companies-house/accounts-ixbrl",
          },
        ],
      },
      {
        q: "How do I close or dissolve a limited company (Form DS01), and how long does it take?",
        a: "Voluntary strike-off uses form DS01 when the company is eligible (not trading, not changed name recently in the restricted period, no ongoing insolvency issues, etc.). Companies House publishes notice; if no objection, the company is typically struck off after about two months from the Gazette notice, though timing varies.",
        steps: [
          "Confirm eligibility on GOV.UK “Closing a limited company”.",
          "File DS01 (online fee currently £13 digital / higher on paper — check the live fees table).",
          "Inform HMRC (Corporation Tax, VAT, PAYE) and close tax registrations as required.",
          "Wait for Gazette notice and strike-off; keep records.",
        ],
        fees:
          "Companies House voluntary strike-off digital fee is £13 (paper higher). Check the live Companies House fees page.",
        pitfalls: [
          "Striking off with assets can leave property belonging to the Crown (bona vacantia).",
          "Directors remain responsible for outstanding filings and tax until closed properly.",
        ],
        sources: [
          { label: "Closing a limited company", href: GOV.closeCompany },
          { label: "Companies House fees", href: GOV.fees },
        ],
        hydra: [
          { label: "Review company filings before you close", href: "/companies" },
          { label: "Create an account for compliance tracking", href: "/create-account" },
        ],
      },
      {
        q: "Can I restore a dissolved company to the register?",
        a: "Yes in defined cases: administrative restoration (within six years, if eligibility tests are met) or restoration by court order. Administrative restoration has a Companies House fee (currently £341 on the fees table) and usually requires bringing filings up to date.",
        steps: [
          "Read the Companies House company restoration guide.",
          "Decide administrative vs court restoration.",
          "Gather documents, pay the fee, and file outstanding accounts / confirmation statements as required.",
        ],
        fees: "Administrative restoration fee is listed on the Companies House fees page (currently £341).",
        sources: [{ label: "Company restoration guide", href: GOV.restore }],
        hydra: [
          { label: "Search dissolved companies", href: "/companies" },
          { label: "Talk to HydraTax support", href: "/support" },
        ],
      },
    ],
  },
  {
    id: "confirmation-statement",
    title: "Confirmation statement (CS01)",
    intro:
      "Annual confirmation of company details — separate from accounts, with identity verification and lawful-purpose rules.",
    items: [
      {
        q: "What is a confirmation statement, and what is the difference between it and annual accounts?",
        a: "The confirmation statement (CS01) confirms that Companies House holds up-to-date information about the company (officers, PSCs, share capital, SIC codes, etc.) and includes required declarations. Annual accounts are the financial statements for the accounting period. Both are usually required each year; filing one does not replace the other.",
        sources: [{ label: "Filing your confirmation statement", href: GOV.cs01Guide }],
        hydra: [
          {
            label: "What is a confirmation statement? (guide)",
            href: "/blog/what-is-a-confirmation-statement",
          },
          {
            label: "File CS01 with HydraTax",
            href: "/companies-house/confirmation-statement",
          },
        ],
      },
      {
        q: "Do I still need to file a confirmation statement if nothing has changed or if my company is dormant?",
        a: "Yes. Every company must file at least one confirmation statement in each 12-month review period, even if nothing changed and even if the company is dormant. You still confirm the information and make the required declarations (including lawful purpose / future activities as required).",
        pitfalls: [
          "Dormancy does not remove the CS01 duty or the accounts duty.",
        ],
        sources: [{ label: "Filing your confirmation statement", href: GOV.cs01Guide }],
        hydra: [
          {
            label: "File CS01 even if nothing changed",
            href: "/companies-house/confirmation-statement",
          },
          {
            label: "File dormant accounts",
            href: "/companies-house/accounts-ixbrl",
          },
        ],
      },
      {
        q: "When is my confirmation statement due, and what is the 14-day filing window?",
        a: "Your review period ends on the confirmation date shown on the company record. You generally have 14 days from the end of the review period to deliver the confirmation statement. Check the exact date on the company’s Companies House profile.",
        steps: [
          "Look up the company on Find and update company information.",
          "Note the next confirmation statement due date.",
          "File within the statutory window (commonly described as 14 days after the review period ends).",
        ],
        sources: [{ label: "Filing your confirmation statement", href: GOV.cs01Guide }],
        hydra: [
          {
            label: "See due dates on HydraTax company search",
            href: "/companies",
          },
          {
            label: "File confirmation statement",
            href: "/companies-house/confirmation-statement",
          },
          {
            label: "Create an account — weekly filing reminders",
            href: "/create-account",
          },
        ],
      },
      {
        q: "How much does it cost to file a confirmation statement online vs. on paper?",
        a: "From the current Companies House fees table: £50 to file online / by software, and £110 on paper form CS01, payable with the first confirmation statement in each 12-month payment period. Further statements in the same payment period do not attract another Companies House annual fee.",
        fees:
          "Companies House: £50 digital / £110 paper. HydraTax CS01 software filing adds Hydra’s service fee on top of the Companies House £50 (see Pricing / checkout for the live total).",
        sources: [
          { label: "Companies House fees", href: GOV.fees },
          { label: "File confirmation statement online", href: GOV.cs01File },
        ],
        hydra: [
          {
            label: "File CS01 online with HydraTax",
            href: "/companies-house/confirmation-statement",
          },
          { label: "Companies House pricing", href: "/pricing#companies-house" },
        ],
      },
      {
        q: "What happens if I file my confirmation statement late or miss the deadline?",
        a: "Late filing is a criminal offence for the company and officers. Companies House can prosecute, and persistent non-filing can lead to the company being struck off. Unlike accounts, there is no separate “late CS01 civil penalty tariff” equivalent to the accounts late-filing penalties table — the risk is offence / enforcement / strike-off.",
        pitfalls: [
          "Ignoring CS01 while focusing only on accounts is a common path to “proposal to strike off”.",
        ],
        sources: [{ label: "Filing your confirmation statement", href: GOV.cs01Guide }],
        hydra: [
          {
            label: "File now if overdue",
            href: "/companies-house/confirmation-statement",
          },
          {
            label: "Track deadlines on the practice desk",
            href: "/dashboard",
          },
          {
            label: "Sign up for weekly CS / accounts / CT600 nudges",
            href: "/create-account",
          },
        ],
      },
      {
        q: "Can I file my confirmation statement early, and does that change next year’s due date?",
        a: "Yes, you can file early. Filing early starts a new review period from the date you choose (subject to Companies House rules), which can move the next confirmation date. Read the GOV.UK section on early filing so you understand how the next due date is calculated.",
        sources: [{ label: "Filing your confirmation statement", href: GOV.cs01Guide }],
        hydra: [
          {
            label: "File CS01 when ready",
            href: "/companies-house/confirmation-statement",
          },
        ],
      },
      {
        q: "Which changes can I make directly on the confirmation statement, and which must be filed separately beforehand?",
        a: "The CS01 can update certain information (for example SIC codes, statement of capital details, shareholder information in the parts provided, and registered email where the form supports it). Changes to directors, PSCs and registered office typically require separate event-driven filings first (appointment/resignation/PSC notices/AD01), then the confirmation statement confirms the register is up to date. Always follow the current CS01 parts guidance.",
        steps: [
          "File event-driven changes (directors, PSCs, registered office) as soon as they occur — do not wait for CS01.",
          "On CS01, confirm details and complete any permitted update parts.",
          "Provide director personal codes for identity verification confirmation.",
        ],
        sources: [{ label: "CS01 guidance", href: GOV.cs01Guide }],
        hydra: [
          {
            label: "File confirmation statement",
            href: "/companies-house/confirmation-statement",
          },
        ],
      },
      {
        q: "What is the “lawful purpose” declaration, and what counts as an “appropriate” registered office address?",
        a: "Confirmation statements include declarations about the company’s intended lawful activities (wording follows current Companies House requirements). An appropriate registered office is a physical location meeting Companies House rules where documents can be delivered and someone acknowledges receipt — PO Box-only or inappropriate addresses are not acceptable under the reformed rules.",
        sources: [
          { label: "Registered office requirements", href: GOV.registeredOffice },
          { label: "CS01 guidance", href: GOV.cs01Guide },
        ],
        hydra: [
          {
            label: "Check your company details before filing",
            href: "/companies",
          },
        ],
      },
    ],
  },
  {
    id: "accounts",
    title: "Company accounts",
    intro:
      "Accounting reference dates, filing deadlines, late penalties, dormant / micro / small accounts, and iXBRL software filing.",
    items: [
      {
        q: "When are my first company accounts due after incorporation?",
        a: "For a private company, if the first accounts cover more than 12 months, deliver them within 21 months of incorporation or within 3 months of the accounting reference date — whichever is longer. If the first period is 12 months or less, the normal 9-month rule from the period end usually applies. Public companies have shorter limits.",
        sources: [{ label: "Life of a company — accounts", href: GOV.accountsLife }],
        hydra: [
          {
            label: "See accounts due dates on company search",
            href: "/companies",
          },
          {
            label: "File annual accounts (iXBRL)",
            href: "/companies-house/accounts-ixbrl",
          },
        ],
      },
      {
        q: "What is the difference between my Accounting Reference Date (ARD) and my filing deadline?",
        a: "The ARD is the end date of the accounting reference period (the financial year-end Companies House uses). The filing deadline is later: normally 9 months after the ARD for a private company (6 months for a public company). First-year rules differ as above.",
        steps: [
          "New companies: first ARD is usually the last day of the month of the first anniversary of incorporation.",
          "Subsequent ARDs fall on the same date each year unless you change them.",
          "Calculate the filing deadline from the period end (exact day rules apply).",
        ],
        sources: [{ label: "Life of a company — accounts", href: GOV.accountsLife }],
        hydra: [
          { label: "Look up ARD / due dates", href: "/companies" },
          { label: "Practice desk deadlines board", href: "/dashboard" },
        ],
      },
      {
        q: "What are the late filing penalties for company accounts, and how quickly do they double?",
        a: "Private company / LLP late accounts penalties (from the due date): not more than 1 month £150; 1–3 months £375; 3–6 months £750; more than 6 months £1,500. Public company penalties are higher. The penalty doubles if accounts are filed late in two successive financial years (rules from 6 April 2008 onwards).",
        fees:
          "Private: £150 / £375 / £750 / £1,500. Doubled for successive late years.",
        pitfalls: [
          "Dormant companies get the same penalties.",
          "Relying on an accountant is not a successful appeal ground by itself.",
        ],
        sources: [{ label: "Late filing penalties", href: GOV.latePenalties }],
        hydra: [
          {
            label: "File accounts before the deadline",
            href: "/companies-house/accounts-ixbrl",
          },
          {
            label: "Get weekly overdue filing reminders",
            href: "/create-account",
          },
        ],
      },
      {
        q: "How can I appeal a Companies House late filing penalty?",
        a: "You can appeal in writing on limited grounds (for example exceptional circumstances outside your control). GOV.UK lists common unsuccessful grounds: dormancy, inability to pay, accountant illness, unfamiliarity with rules, postal delays, overseas travel. Act quickly and follow the appeal instructions on the penalty notice.",
        sources: [{ label: "Late filing penalties", href: GOV.latePenalties }],
        hydra: [
          { label: "Support centre", href: "/support" },
          { label: "File on time next period", href: "/companies-house/accounts-ixbrl" },
        ],
      },
      {
        q: "How do I file dormant company accounts (Form AA02) if my business hasn't traded?",
        a: "Paper AA02 is only for a company limited by shares that has never traded and whose only transaction is the issue of subscriber shares. Otherwise file dormant accounts online / via software. Deadlines and late penalties are the same as for trading companies.",
        steps: [
          "Confirm the company is dormant for Companies Act purposes for the period.",
          "Prefer online / software filing unless AA02 eligibility is met.",
          "File by the same deadline as any other accounts.",
        ],
        sources: [
          { label: "File dormant accounts AA02", href: GOV.aa02 },
          { label: "Accounts guidance", href: GOV.accountsLife },
        ],
        hydra: [
          {
            label: "File dormant / micro accounts with HydraTax",
            href: "/companies-house/accounts-ixbrl",
          },
        ],
      },
      {
        q: "Do I qualify to file micro-entity or small company accounts, and what gets published on the public register?",
        a: "Qualification depends on Companies Act size criteria (turnover, balance sheet total, employees — thresholds on GOV.UK). Micro-entities (FRS 105) and small companies (FRS 102 Section 1A) can file reduced accounts. What appears on the public register is typically abridged / filleted information — not always the full accounts members receive.",
        sources: [{ label: "Accounts guidance", href: GOV.accountsLife }],
        hydra: [
          {
            label: "Prepare and file micro / small accounts",
            href: "/companies-house/accounts-ixbrl",
          },
          { label: "Year-end desk for clients", href: "/dashboard" },
        ],
      },
      {
        q: "How do I extend or shorten my company’s financial year?",
        a: "Change the accounting reference date by filing with Companies House (subject to limits: you generally cannot extend more than once in five years except in defined cases; shortening is more flexible but can bring the filing deadline forward). If you change ARD after the old filing deadline has passed, a late filing penalty can arise automatically.",
        pitfalls: [
          "Shortening a period can create an immediate overdue filing.",
          "Extensions have statutory restrictions — check GOV.UK before filing.",
        ],
        sources: [{ label: "Accounts guidance", href: GOV.accountsLife }],
        hydra: [
          { label: "Review current ARD on company search", href: "/companies" },
        ],
      },
      {
        q: "Can I file my accounts and Company Tax Return (CT600) to Companies House and HMRC at the same time?",
        a: "They are separate obligations. Companies House receives statutory accounts (often iXBRL). HMRC receives the Company Tax Return (CT600) with computations, usually by the Corporation Tax filing deadline (normally 12 months after the end of the accounting period). Some software workflows prepare both from the same year-end pack, but they are submitted to different registries.",
        sources: [
          { label: "Corporation Tax", href: GOV.ctRegister },
          { label: "Accounts guidance", href: GOV.accountsLife },
        ],
        hydra: [
          {
            label: "File Companies House accounts",
            href: "/companies-house/accounts-ixbrl",
          },
          { label: "CT600 pricing / desk", href: "/pricing#ct600" },
          { label: "Open practice desk", href: "/dashboard" },
        ],
      },
      {
        q: "Why do I need accounting software to file my accounts (software-only filing and iXBRL)?",
        a: "Companies House requires most accounts to be filed digitally in iXBRL (inline XBRL) via approved software or services. Paper filing is heavily restricted. Software tags the accounts so Companies House and HMRC can process structured data reliably.",
        sources: [{ label: "Accounts guidance", href: GOV.accountsLife }],
        hydra: [
          {
            label: "File iXBRL accounts with HydraTax",
            href: "/companies-house/accounts-ixbrl",
          },
          { label: "Create an account", href: "/create-account" },
        ],
      },
    ],
  },
  {
    id: "formation",
    title: "Company formation",
    intro:
      "Sole trader vs limited company, incorporation fees, names, shares, PSCs, model articles and post-incorporation checklist.",
    items: [
      {
        q: "Should I register as a sole trader or a limited company?",
        a: "A sole trader is simpler and reports profits on Self Assessment. A limited company is a separate legal person with limited liability, Companies House filings, Corporation Tax, and often more admin. Choose based on liability, growth, investment, tax position and compliance appetite — take advice for your circumstances.",
        hydra: [
          { label: "Incorporate a limited company", href: "/companies-house/incorporation" },
          { label: "Self Assessment desk", href: "/pricing#self-assessment" },
          { label: "Create an account", href: "/create-account" },
        ],
      },
      {
        q: "How much does it cost to register a limited company, and how long does approval take?",
        a: "Companies House digital / software incorporation is currently £100 (same-day software £156; paper higher). Straightforward digital applications are often processed the same day or within a short period; incomplete applications take longer.",
        fees:
          "Companies House: £100 standard digital / £156 same-day software. HydraTax adds its service fee on software incorporation — see checkout.",
        sources: [
          { label: "Limited company formation", href: GOV.incorporate },
          { label: "Companies House fees", href: GOV.fees },
        ],
        hydra: [
          {
            label: "Incorporate with HydraTax",
            href: "/companies-house/incorporation",
          },
          { label: "Same-day incorporation option", href: "/pricing#companies-house" },
        ],
      },
      {
        q: "How do I check if my desired company name is available, and what words are restricted?",
        a: "Search the register for identical and too-similar names. Sensitive words (for example “bank”, “Royal”) need approval. Offensive or misleading names can be refused. Check GOV.UK incorporation and names guidance before you apply.",
        sources: [
          { label: "Find company information", href: GOV.findCompany },
          { label: "Incorporation and names", href: GOV.companyNames },
        ],
        hydra: [
          { label: "Search existing companies", href: "/companies" },
          {
            label: "Start incorporation (live name checks in wizard)",
            href: "/companies-house/incorporation",
          },
        ],
      },
      {
        q: "Can I use my home address as my registered office, and how do I keep my residential address off the public register?",
        a: "You may use a home address as the registered office if it meets the “appropriate address” rules. Directors’ usual residential address (URA) is protected and not shown on the public register in the same way as the service address; you still must provide a URA to Companies House. Many founders use a separate service address for the public officer appointment while keeping URA private.",
        sources: [
          { label: "Registered office requirements", href: GOV.registeredOffice },
        ],
        hydra: [
          {
            label: "Incorporate with proper address fields",
            href: "/companies-house/incorporation",
          },
        ],
      },
      {
        q: "How many shares should I issue when setting up a company, and what should each share be worth?",
        a: "There is no single legal “correct” number. Many private companies issue 1 or 100 ordinary £1 shares for simplicity. Share capital should reflect ownership intentions (for example 100 shares makes 1% splits easy). Nominal value is usually £1 but can be another amount. Document subscribers correctly on incorporation.",
        hydra: [
          {
            label: "Guided share capital on incorporation",
            href: "/companies-house/incorporation",
          },
        ],
      },
      {
        q: "What is a Person with Significant Control (PSC), and who needs to be listed?",
        a: "A PSC is someone who meets the significant control conditions (for example holding more than 25% of shares or voting rights, or exercising significant influence or control). Most companies must maintain a PSC register and file PSC details with Companies House. PSCs must also complete identity verification under the ECCTA regime.",
        sources: [{ label: "People with significant control", href: GOV.psc }],
        hydra: [
          {
            label: "Set PSCs during incorporation",
            href: "/companies-house/incorporation",
          },
          {
            label: "Identity verification guide",
            href: "/blog/how-to-verify-identity-companies-house",
          },
        ],
      },
      {
        q: "What are the Memorandum and Articles of Association, and can I use standard “Model Articles”?",
        a: "The memorandum records subscribers at incorporation. The articles are the company’s constitution. Most private companies limited by shares adopt the Model Articles under the Companies Act 2006, optionally with bespoke amendments. HydraTax incorporation uses model articles by default unless you instruct otherwise.",
        hydra: [
          {
            label: "Incorporate with model articles",
            href: "/companies-house/incorporation",
          },
        ],
      },
      {
        q: "Can one limited company run multiple different businesses or trading names?",
        a: "Yes. A company can operate multiple trades and use business (“trading as”) names, subject to naming rules and disclosure requirements. You may need additional SIC codes on the confirmation statement to reflect activities. Tax and licensing still apply per activity.",
        hydra: [
          {
            label: "Update activities on confirmation statement",
            href: "/companies-house/confirmation-statement",
          },
        ],
      },
      {
        q: "What do I need to do immediately after my company is incorporated?",
        a: "Typical next steps: record the certificate of incorporation and authentication code; open a business bank account; register for Corporation Tax with HMRC within the required window; consider VAT / PAYE if needed; set up bookkeeping; diary confirmation statement and accounts deadlines; complete director / PSC identity verification if not already done.",
        steps: [
          "Store company number, authentication code and personal codes securely.",
          "Register for Corporation Tax (HMRC).",
          "Open a business bank account in the company name.",
          "Set accounting systems and diary CS01 + accounts due dates.",
          "Verify identity for directors / PSCs if outstanding.",
        ],
        sources: [
          { label: "Corporation Tax", href: GOV.ctRegister },
          { label: "Limited company formation", href: GOV.incorporate },
        ],
        hydra: [
          { label: "Create a HydraTax account", href: "/create-account" },
          {
            label: "Weekly reminders for CS01, accounts & CT600",
            href: "/create-account",
          },
          { label: "Open the practice desk", href: "/dashboard" },
          {
            label: "File first confirmation statement when due",
            href: "/companies-house/confirmation-statement",
          },
        ],
      },
    ],
  },
];

export function allChComplianceFaqs(): ChComplianceFaq[] {
  return CH_COMPLIANCE_SECTIONS.flatMap((s) => s.items);
}

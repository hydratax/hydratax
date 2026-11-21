/**
 * learnerbee — curated product playbooks for the in-app coach bubble.
 * Keep copy desk-safe (no API / OAuth jargon). Name exact cards / buttons.
 */

export type CoachHomeAction =
  | { kind: "playbook"; id: string; label: string }
  | { kind: "link"; label: string; href: string };

export type PlaybookStep = {
  id: string;
  title: string;
  body: string;
  /** Deep link for this step (list pages are preferred when no client is open). */
  href?: string;
  ctaLabel?: string;
};

export type Playbook = {
  id: string;
  title: string;
  steps: PlaybookStep[];
};

export const COACH_HOME_PROMPT = "What do you need help with?";

export const COACH_HOME_ACTIONS: CoachHomeAction[] = [
  { kind: "playbook", id: "sa100", label: "Create an SA100" },
  { kind: "playbook", id: "vat-return", label: "File a VAT return" },
  { kind: "playbook", id: "ct600", label: "Corporation Tax (CT600)" },
  { kind: "playbook", id: "paye", label: "Run payroll (PAYE)" },
  { kind: "playbook", id: "hmrc-connect", label: "Connect to HMRC" },
  { kind: "link", label: "Browse Support", href: "/support" },
];

export const PLAYBOOKS: Record<string, Playbook> = {
  sa100: {
    id: "sa100",
    title: "Create an SA100",
    steps: [
      {
        id: "sa-list",
        title: "Open Self Assessment",
        body: "In the top menu choose Self Assessment (or go to Clients → Self Assessment). You’ll see person cards under People and Sole traders & partners — click anywhere on a card to open them (not only the name).",
        href: "/clients?desk=sa",
        ctaLabel: "Open Self Assessment",
      },
      {
        id: "sa-person",
        title: "Open or add the person",
        body: "Click the person’s card. If they are new, use Add a person (top right) and enter NINO, date of birth, and personal UTR on their profile card — this is a person desk, not a company.",
        href: "/clients/new?desk=sa",
        ctaLabel: "Add a person",
      },
      {
        id: "sa-year",
        title: "Choose the tax year",
        body: "On the Self Assessment desk, use the tax year control (near the top of the return workspace) and pick the year you are filing — for example 2025–26.",
      },
      {
        id: "sa-fill",
        title: "Fill income and expenses",
        body: "Work down the SA cards: employment (SA102), self-employment (SA103), property (SA105), dividends, and so on. Where bank lines appear, open the bank / heads card and allocate amounts into those boxes.",
      },
      {
        id: "sa-finish",
        title: "Review and finish",
        body: "Open the tax calculation / review section at the bottom of the desk. Use Email draft to client if needed, then Submit when the return is final.",
      },
    ],
  },
  "vat-return": {
    id: "vat-return",
    title: "File a VAT return",
    steps: [
      {
        id: "vat-list",
        title: "Open VAT clients",
        body: "In the top menu choose VAT. You’ll see company cards in a grid — click anywhere on the company card (not only the name) to open their VAT desk.",
        href: "/clients?desk=vat",
        ctaLabel: "Open VAT",
      },
      {
        id: "vat-desk",
        title: "Open the VAT return",
        body: "On the left, under VAT periods / File next VAT return, click the open quarter card. Below the nine boxes, open the Transaction breakdown card for that same quarter.",
      },
      {
        id: "vat-allocate",
        title: "Allocate transaction heads",
        body: "In Transaction breakdown, each head is its own card (Turnover / sales, Expense queries, and so on). On the right of each card, use the VAT box dropdown — leave Auto only if you mean to; otherwise pick Box 1 & 6, Box 4 & 7, Exempt, etc.",
      },
      {
        id: "vat-fill",
        title: "Fill the nine boxes",
        body: "Back on the File next VAT return card (Create digital record), press Fill boxes from transactions card. Boxes 1–9 sit in that card; Boxes 3 and 5 calculate automatically. Or type figures in the right-hand boxes.",
      },
      {
        id: "vat-submit",
        title: "Connect and submit",
        body: "At the bottom of the File next VAT return card, use Connect to HMRC to submit (or Submit VAT return to HMRC once connected). Email draft to client is beside it.",
      },
    ],
  },
  ct600: {
    id: "ct600",
    title: "Corporation Tax (CT600)",
    steps: [
      {
        id: "ct-list",
        title: "Open Corporation Tax",
        body: "In the top menu choose Corporation Tax (or Filings → Corporation Tax). Open a company by clicking anywhere on its card in the list.",
        href: "/filings/corporation-tax",
        ctaLabel: "Open Corporation Tax",
      },
      {
        id: "ct-period",
        title: "Pick the accounting period",
        body: "On the company CT desk, use the accounting period cards / list (including first-year splits for new companies). Click the period you are filing.",
      },
      {
        id: "ct-prepare",
        title: "Prepare accounts and CT600",
        body: "Use the year-end / accounts cards for the P&L and balance sheet, then the CT600 card. Tax on profit sits on the P&L; unpaid CT stays inside Creditors within one year — not a separate balance-sheet line.",
      },
      {
        id: "ct-submit",
        title: "Review and file",
        body: "Review the pack on the CT desk, then use the submit control at the bottom of the CT600 / filing card when the client is ready.",
      },
    ],
  },
  paye: {
    id: "paye",
    title: "Run payroll (PAYE)",
    steps: [
      {
        id: "paye-list",
        title: "Open PAYE clients",
        body: "In the top menu choose PAYE. Employer cards appear in a grid — click anywhere on the card to open payroll (status dropdown on the card stays separate).",
        href: "/clients?desk=payroll",
        ctaLabel: "Open PAYE",
      },
      {
        id: "paye-desk",
        title: "Open payroll",
        body: "On the payroll desk, use the employee cards and the pay period / From–To controls at the top to choose who and which dates you are paying.",
      },
      {
        id: "paye-run",
        title: "Run pay and documents",
        body: "Run the pay from the main payroll card, then open Documents (or the documents hub) for payslips, P60 packs, and RTI files for that run.",
      },
    ],
  },
  "hmrc-connect": {
    id: "hmrc-connect",
    title: "Connect to HMRC",
    steps: [
      {
        id: "hmrc-desk",
        title: "Open the filing desk",
        body: "Usual path: top menu → VAT → click the company card → File next VAT return card. You can also open Settings → HMRC connections for an overview.",
        href: "/clients?desk=vat",
        ctaLabel: "Open VAT clients",
      },
      {
        id: "hmrc-details",
        title: "Enter client details",
        body: "On the File next VAT return card footer, press Connect to HMRC. In the dialog, choose My own business or Tax agent, enter the 9-digit VAT number and registration date, and ARN if you are an agent.",
      },
      {
        id: "hmrc-approve",
        title: "Approve on HMRC",
        body: "Continue to HMRC, approve access for this client, then return to HydraTax. The same card should show HMRC connected before you submit.",
      },
    ],
  },
};

export function getPlaybook(id: string): Playbook | null {
  return PLAYBOOKS[id] ?? null;
}

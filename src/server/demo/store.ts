/**
 * Ephemeral in-memory practice for local development when DATABASE_URL is unset
 * and MEMORY_STORE=true. Starts empty — no sample clients.
 *
 * Admin views never expose PII from filing payloads — only operational metadata.
 */
export type MemoryClient = {
  id: string;
  practiceId: string;
  name: string;
  type: "sole_trader" | "limited_company" | "partnership";
  companyNumber: string | null;
  utr: string | null;
  vrn: string | null;
  nino: string | null;
  payeRef: string | null;
  accountsOfficeRef: string | null;
  isEmployer: boolean;
  isVatRegistered: boolean;
  contactEmail?: string | null;
  /** Companies House enrichment for limited companies */
  companiesHouse?: import("@/server/companies-house/enrich-client").ClientCompaniesHouseSnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryLedgerEntry = {
  id: string;
  clientId: string;
  type: "income" | "expense";
  description: string;
  amountPence: number;
  vatRateBps: number;
  vatPence: number;
  dated: string;
  category: string | null;
  createdBy: string;
  createdAt: string;
};

export type MemoryEmployee = {
  id: string;
  clientId: string;
  forename: string;
  surname: string;
  nino: string;
  taxCode: string;
  annualSalaryPence: number;
  startDate: string;
  active: boolean;
};

export type MemoryDocument = {
  id: string;
  clientId: string;
  practiceId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  blobUrl: string;
  category: string;
  uploadedBy: string;
  createdAt: string;
};

export type MemoryBankTx = {
  id: string;
  clientId: string;
  practiceId: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
  source: string;
  createdAt: string;
};

export type MemoryEmailLog = {
  id: string;
  practiceId: string;
  clientId: string;
  toDomain: string;
  subject: string;
  documentCount: number;
  delivery: string;
  createdAt: string;
};

/** Operational record only — no director names, emails, or personal codes in admin exports */
export type MemoryChRequest = {
  id: string;
  practiceId: string;
  serviceId: string;
  companyNumber: string | null;
  /** Hashed / opaque account ref — not email */
  accountRef: string;
  paymentStatus: "unpaid" | "paid" | "refunded";
  subscriptionActive: boolean;
  planKey: string | null;
  status: "received" | "in_progress" | "submitted" | "completed" | "rejected";
  amountPence: number;
  createdAt: string;
  updatedAt: string;
  /** Filing payload kept for ops; stripped from admin list APIs */
  payload?: Record<string, unknown>;
};

export type MemorySubscription = {
  id: string;
  practiceId: string;
  planKey: string;
  status: "active" | "cancelled" | "past_due";
  stripeSessionId: string | null;
  createdAt: string;
};

export type MemoryAccountProfile = {
  orgType: "company" | "sole_trader" | "partnership" | "practice";
  orgSearch: string;
  firstName: string;
  /** Not exposed on admin dashboards */
  createdAt: string;
};

export type MemoryTeamMember = {
  id: string;
  practiceId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "practitioner" | "readonly";
  moduleAccess: import("@/lib/access").ModuleAccess;
  active: boolean;
  createdAt: string;
};

export type MemoryInvoiceLine = {
  description: string;
  quantity: number;
  unitPricePence: number;
  vatRateBps: number;
  lineNetPence: number;
  lineVatPence: number;
};

export type MemoryInvoice = {
  id: string;
  practiceId: string;
  clientId: string;
  invoiceNumber: string;
  status: "draft" | "sent" | "due" | "paid" | "void";
  issueDate: string;
  dueDate: string;
  currency: string;
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  notes: string | null;
  lines: MemoryInvoiceLine[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MemoryFeatureRequest = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  authorEmail: string | null;
  authorUserId: string | null;
  status: "open" | "planned" | "shipping" | "shipped";
  voteCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MemoryFeatureVote = {
  id: string;
  requestId: string;
  voterKey: string;
  createdAt: string;
};

type MemoryStore = {
  practice: {
    id: string;
    clerkOrgId: string;
    name: string;
  };
  accountProfile: MemoryAccountProfile | null;
  clients: MemoryClient[];
  ledger: MemoryLedgerEntry[];
  vatReturns: Array<Record<string, unknown>>;
  saSubmissions: Array<Record<string, unknown>>;
  ct600Returns: Array<Record<string, unknown>>;
  employees: MemoryEmployee[];
  payRuns: Array<Record<string, unknown>>;
  documents: MemoryDocument[];
  bankTransactions: MemoryBankTx[];
  emailLogs: MemoryEmailLog[];
  chRequests: MemoryChRequest[];
  subscriptions: MemorySubscription[];
  trialBalances: import("@/server/trial-balance/map").TrialBalance[];
  teamMembers: MemoryTeamMember[];
  invoices: MemoryInvoice[];
  featureRequests: MemoryFeatureRequest[];
  featureVotes: MemoryFeatureVote[];
  csFilings: import("@/server/companies-house/filing/types").CsFilingRecord[];
  /** Local demo: act as this team member id (null = practice owner) */
  actingMemberId: string | null;
  hmrcConnections: Array<{
    clientId: string;
    connected: boolean;
    hmrcEnv: string;
    scopes: string;
  }>;
  auditEvents: Array<Record<string, unknown>>;
};

function seedFeatureRequests(): MemoryFeatureRequest[] {
  const now = new Date().toISOString();
  return [
    {
      id: "fr-seed-bulk-ch",
      title: "Bulk Companies House filing for a client list",
      body: "Select multiple limited companies and queue confirmation statements in one pass — with per-company auth codes.",
      authorName: "Practice partner",
      authorEmail: null,
      authorUserId: null,
      status: "planned",
      voteCount: 24,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fr-seed-deadline-board",
      title: "Firm-wide deadline board across all rails",
      body: "One calendar for VAT, CT600, SA, PAYE and Companies House due dates, filterable by staff member.",
      authorName: "Office manager",
      authorEmail: null,
      authorUserId: null,
      status: "open",
      voteCount: 41,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "fr-seed-client-portal",
      title: "Client portal for document upload & e-sign",
      body: "Let clients drop bank CSV and approve drafts without emailing attachments around.",
      authorName: "Senior accountant",
      authorEmail: null,
      authorUserId: null,
      status: "open",
      voteCount: 33,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function emptyStore(): MemoryStore {
  return {
    practice: {
      id: "11111111-1111-1111-1111-111111111111",
      clerkOrgId: "org_local_practice",
      name: "Your practice",
    },
    accountProfile: null,
    clients: [],
    ledger: [],
    vatReturns: [],
    saSubmissions: [],
    ct600Returns: [],
    employees: [],
    payRuns: [],
    documents: [],
    bankTransactions: [],
    emailLogs: [],
    chRequests: [],
    subscriptions: [],
    trialBalances: [],
    teamMembers: [],
    invoices: [],
    featureRequests: seedFeatureRequests(),
    featureVotes: [],
    csFilings: [],
    actingMemberId: null,
    hmrcConnections: [],
    auditEvents: [],
  };
}

const globalForStore = globalThis as unknown as {
  __hydrataxMemory?: MemoryStore;
};

export const memoryStore: MemoryStore =
  globalForStore.__hydrataxMemory ??
  (globalForStore.__hydrataxMemory = emptyStore());

/** @deprecated Use memoryStore */
export const demoStore = memoryStore;
export type DemoClient = MemoryClient;
export type DemoLedgerEntry = MemoryLedgerEntry;
export type DemoEmployee = MemoryEmployee;

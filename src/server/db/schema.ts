import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "practitioner",
  "readonly",
]);

export const clientTypeEnum = pgEnum("client_type", [
  "sole_trader",
  "limited_company",
  "partnership",
]);

export const ledgerTypeEnum = pgEnum("ledger_type", ["income", "expense"]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "draft",
  "ready",
  "submitted",
  "accepted",
  "rejected",
  "error",
]);

export const practices = pgTable(
  "practices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkOrgId: text("clerk_org_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("practices_clerk_org_uidx").on(t.clerkOrgId)],
);

export const practiceMembers = pgTable(
  "practice_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    clerkUserId: text("clerk_user_id").notNull(),
    role: memberRoleEnum("role").notNull().default("practitioner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("practice_members_uidx").on(t.practiceId, t.clerkUserId),
    index("practice_members_user_idx").on(t.clerkUserId),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    name: text("name").notNull(),
    type: clientTypeEnum("type").notNull(),
    companyNumber: text("company_number"),
    utr: text("utr"),
    vrn: text("vrn"),
    nino: text("nino"),
    payeRef: text("paye_ref"),
    accountsOfficeRef: text("accounts_office_ref"),
    isEmployer: boolean("is_employer").notNull().default(false),
    isVatRegistered: boolean("is_vat_registered").notNull().default(false),
    contactEmail: text("contact_email"),
    payrollPackPasswordEncrypted: text("payroll_pack_password_encrypted"),
    /** JSON snapshot from Companies House Public Data API */
    companiesHouse: jsonb("companies_house"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("clients_practice_idx").on(t.practiceId)],
);

export const hmrcConnections = pgTable(
  "hmrc_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    hmrcEnv: text("hmrc_env").notNull(),
    encryptedAccessToken: text("encrypted_access_token").notNull(),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }).notNull(),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("hmrc_connections_client_uidx").on(t.clientId)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    type: ledgerTypeEnum("type").notNull(),
    description: text("description").notNull(),
    amountPence: integer("amount_pence").notNull(),
    vatRateBps: integer("vat_rate_bps").notNull().default(2000),
    vatPence: integer("vat_pence").notNull(),
    dated: text("dated").notNull(),
    category: text("category"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ledger_client_idx").on(t.clientId),
    index("ledger_client_dated_idx").on(t.clientId, t.dated),
  ],
);

export const vatReturns = pgTable("vat_returns", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  periodKey: text("period_key").notNull(),
  status: submissionStatusEnum("status").notNull().default("draft"),
  boxes: jsonb("boxes").notNull(),
  hmrcFormBundleNumber: text("hmrc_form_bundle_number"),
  hmrcPaymentIndicator: text("hmrc_payment_indicator"),
  hmrcProcessingDate: text("hmrc_processing_date"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const saSubmissions = pgTable("sa_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  taxYear: text("tax_year").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: submissionStatusEnum("status").notNull().default("draft"),
  turnoverPence: integer("turnover_pence").notNull(),
  otherIncomePence: integer("other_income_pence").notNull().default(0),
  expensesPence: integer("expenses_pence").notNull(),
  hmrcCorrelationId: text("hmrc_correlation_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const ct600Returns = pgTable("ct600_returns", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: submissionStatusEnum("status").notNull().default("draft"),
  figures: jsonb("figures").notNull(),
  xmlPayloadHash: text("xml_payload_hash"),
  hmrcCorrelationId: text("hmrc_correlation_id"),
  hmrcReceipt: text("hmrc_receipt"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    forename: text("forename").notNull(),
    surname: text("surname").notNull(),
    nino: text("nino").notNull(),
    taxCode: text("tax_code").notNull(),
    annualSalaryPence: integer("annual_salary_pence").notNull(),
    startDate: text("start_date").notNull(),
    payrollId: text("payroll_id"),
    payFrequency: text("pay_frequency").notNull().default("M1"),
    niCategory: text("ni_category").notNull().default("A"),
    jobTitle: text("job_title"),
    leaveDate: text("leave_date"),
    starterDeclaration: text("starter_declaration"),
    firstFpsSent: boolean("first_fps_sent").notNull().default(false),
    previousPayrollId: text("previous_payroll_id"),
    hoursPerWeek: integer("hours_per_week").notNull().default(3750),
    hourlyRatePence: integer("hourly_rate_pence").notNull().default(0),
    payBasis: text("pay_basis").notNull().default("salary"),
    pensionOptOut: boolean("pension_opt_out").notNull().default(false),
    sspQualifyingDays: integer("ssp_qualifying_days").notNull().default(5),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("employees_client_idx").on(t.clientId)],
);

export const payRuns = pgTable("pay_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  payDate: text("pay_date").notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  payFrequency: text("pay_frequency").notNull().default("M1"),
  kind: text("kind").notNull().default("FPS"),
  status: submissionStatusEnum("status").notNull().default("draft"),
  totals: jsonb("totals").notNull(),
  lines: jsonb("lines").notNull(),
  fpsXmlHash: text("fps_xml_hash"),
  hmrcCorrelationId: text("hmrc_correlation_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const payrollTimesheets = pgTable(
  "payroll_timesheets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    filename: text("filename").notNull(),
    rows: jsonb("rows").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("payroll_timesheets_client_idx").on(t.clientId),
    uniqueIndex("payroll_timesheets_period_uidx").on(
      t.clientId,
      t.periodStart,
      t.periodEnd,
    ),
  ],
);

/** Append-only immutable audit log — no update/delete paths in application code. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceId: uuid("practice_id"),
    clientId: uuid("client_id"),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    payloadHash: text("payload_hash"),
    hmrcStatusCode: integer("hmrc_status_code"),
    hmrcCorrelationId: text("hmrc_correlation_id"),
    detail: jsonb("detail"),
    prevHash: text("prev_hash"),
    eventHash: text("event_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("audit_client_idx").on(t.clientId),
    index("audit_practice_idx").on(t.practiceId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

export const clientDocuments = pgTable(
  "client_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    blobUrl: text("blob_url").notNull(),
    category: text("category").notNull().default("general"),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("documents_client_idx").on(t.clientId),
    index("documents_practice_idx").on(t.practiceId),
  ],
);

export const practiceSubscriptions = pgTable(
  "practice_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    planKey: text("plan_key").notNull(),
    status: text("status").notNull().default("active"),
    stripeSessionId: text("stripe_session_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    trialReminderSentAt: timestamp("trial_reminder_sent_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("practice_subs_practice_idx").on(t.practiceId),
    index("practice_subs_plan_idx").on(t.planKey),
  ],
);

/**
 * Companies House filing requests.
 * Admin APIs must never return `payload` (may contain delivery addresses etc.).
 * Personal codes must not be persisted in payload long-term for compliance —
 * collect at submit time only where required for filing.
 */
export const companiesHouseRequests = pgTable(
  "companies_house_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    serviceId: text("service_id").notNull(),
    companyNumber: text("company_number"),
    accountRef: text("account_ref").notNull(),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    subscriptionActive: boolean("subscription_active").notNull().default(false),
    planKey: text("plan_key"),
    status: text("status").notNull().default("received"),
    amountPence: integer("amount_pence").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("ch_requests_practice_idx").on(t.practiceId),
    index("ch_requests_status_idx").on(t.status),
    index("ch_requests_payment_idx").on(t.paymentStatus),
  ],
);

export const checkoutOrders = pgTable(
  "checkout_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    planKey: text("plan_key").notNull(),
    amountTotal: integer("amount_total"),
    currency: text("currency"),
    customerEmail: text("customer_email"),
    status: text("status").notNull(),
    mode: text("mode").notNull(),
    metadata: jsonb("metadata"),
    practiceId: uuid("practice_id").references(() => practices.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("checkout_orders_session_uidx").on(t.stripeSessionId),
    index("checkout_orders_email_idx").on(t.customerEmail),
  ],
);

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    dated: text("dated").notNull(),
    description: text("description").notNull(),
    amountPence: integer("amount_pence").notNull(),
    category: text("category").notNull(),
    confidence: text("confidence").notNull().default("low"),
    source: text("source").notNull().default("csv"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("bank_tx_client_idx").on(t.clientId),
    index("bank_tx_dated_idx").on(t.clientId, t.dated),
  ],
);

export const featureRequests = pgTable(
  "feature_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    authorUserId: text("author_user_id"),
    status: text("status").notNull().default("open"),
    voteCount: integer("vote_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("feature_requests_votes_idx").on(t.voteCount),
    index("feature_requests_status_idx").on(t.status),
  ],
);

export const featureVotes = pgTable(
  "feature_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => featureRequests.id, { onDelete: "cascade" }),
    voterKey: text("voter_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("feature_votes_request_voter_uidx").on(t.requestId, t.voterKey),
    index("feature_votes_voter_idx").on(t.voterKey),
  ],
);

export const confirmationStatementFilings = pgTable(
  "confirmation_statement_filings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: text("status").notNull().default("draft"),
    companyNumber: text("company_number").notNull(),
    companyName: text("company_name").notNull(),
    confirmationDate: text("confirmation_date").notNull(),
    clientId: uuid("client_id"),
    practiceId: uuid("practice_id"),
    encryptedSecrets: text("encrypted_secrets"),
    directorNames: jsonb("director_names").$type<string[]>().notNull().default([]),
    lawfulPurposeConfirmed: boolean("lawful_purpose_confirmed")
      .notNull()
      .default(false),
    registeredEmail: text("registered_email"),
    chTransactionRef: text("ch_transaction_ref"),
    chSubmissionNumber: text("ch_submission_number"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("cs_filings_company_idx").on(t.companyNumber),
    index("cs_filings_status_idx").on(t.status),
    index("cs_filings_practice_idx").on(t.practiceId),
  ],
);

/** Ops log — stores recipient domain only, not full mailbox, for admin safety */
export const clientEmailLogs = pgTable(
  "client_email_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    toDomain: text("to_domain").notNull(),
    subject: text("subject").notNull(),
    documentCount: integer("document_count").notNull().default(0),
    delivery: text("delivery").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("email_logs_client_idx").on(t.clientId)],
);

export type Practice = typeof practices.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type ClientDocument = typeof clientDocuments.$inferSelect;
export type CheckoutOrder = typeof checkoutOrders.$inferSelect;

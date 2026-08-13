import Link from "next/link";
import { getClient } from "@/server/actions/clients";
import { getConnectionStatus } from "@/server/actions/hmrc-connect";
import { listClientInvoices } from "@/server/actions/invoices";
import { requireSession } from "@/server/auth/session";
import { ClientTabs } from "@/components/client-tabs";
import { HmrcConnectButton } from "@/components/forms/hmrc-connect-button";
import { InvoiceSummaryCards } from "@/components/forms/invoice-workspace";
import { listAuditEvents } from "@/server/audit/log";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { canAccessModule } from "@/lib/access";
import {
  formatDueShort,
  urgencyForDueDate,
  type FilingUrgency,
} from "@/lib/filing-due";
import { FileAccountsMenu } from "@/components/file-accounts-menu";
import { refreshClientCompaniesHouse } from "@/server/actions/clients";

function urgencyText(u: FilingUrgency) {
  if (u === "overdue") return "text-danger font-semibold";
  if (u === "due_soon") return "text-violet font-semibold";
  return "font-medium text-ink";
}

function formatDate(iso: string | null | undefined) {
  return formatDueShort(iso) ?? "—";
}

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const client = await getClient(id);
  const connection = await getConnectionStatus(id);
  const audit = await listAuditEvents({ clientId: id, limit: 8 });
  const invoices = canAccessModule(session.moduleAccess, "invoices")
    ? await listClientInvoices(id).catch(() => [])
    : [];
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;

  const isLtd = client.type === "limited_company";
  const identifiers: Array<{
    label: string;
    value: string | null | undefined;
    requiredFor: string;
  }> = [
    {
      label: "Company number",
      value: client.companyNumber,
      requiredFor: "Companies House",
    },
    { label: "UTR", value: client.utr, requiredFor: "CT600" },
    { label: "VRN", value: client.vrn, requiredFor: "MTD VAT" },
    { label: "NINO", value: client.nino, requiredFor: "Self Assessment" },
    { label: "PAYE", value: client.payeRef, requiredFor: "Payroll / RTI" },
    {
      label: "Accounts Office",
      value: client.accountsOfficeRef,
      requiredFor: "Payroll / EPS",
    },
  ];

  const missingIds = identifiers.filter((row) => !row.value);
  const requiredMissing = identifiers.filter((row) => {
    if (row.label === "Company number") return isLtd && !row.value;
    if (row.label === "UTR") return isLtd && !row.value;
    if (row.label === "VRN") return client.isVatRegistered && !row.value;
    if (row.label === "NINO")
      return client.type !== "limited_company" && !row.value;
    if (row.label === "PAYE" || row.label === "Accounts Office") {
      return client.isEmployer && !row.value;
    }
    return false;
  });

  const activeDirectors = (ch?.directors ?? []).filter((d) => !d.resignedOn);
  const activePscs = (ch?.pscs ?? []).filter((p) => !p.ceasedOn);

  const company = client.companyNumber
    ? encodeURIComponent(client.companyNumber)
    : "";
  const csHref = company
    ? `/companies-house/confirmation-statement?company=${company}&clientId=${encodeURIComponent(id)}`
    : "/companies-house/confirmation-statement";
  const accountsHref = company
    ? `/companies-house/accounts-ixbrl?company=${company}&clientId=${encodeURIComponent(id)}`
    : "/companies-house/accounts-ixbrl";

  const csUrgency = urgencyForDueDate(ch?.confirmationStatementNextDue);
  const accountsUrgency = urgencyForDueDate(ch?.accountsNextDue);

  const modules = [
    {
      label: "Books",
      href: `/clients/${id}/books`,
      desc: "Income & expenses in pence",
      module: "books" as const,
      show: true,
    },
    {
      label: "Bank",
      href: `/clients/${id}/bank`,
      desc: "Statements → SA / CT drafts",
      module: "bank" as const,
      show: true,
    },
    {
      label: "Documents",
      href: `/clients/${id}/documents`,
      desc: "Upload working papers",
      module: "documents" as const,
      show: true,
    },
    {
      label: "VAT",
      href: `/clients/${id}/vat`,
      desc: "Prepare → review → submit",
      module: "vat" as const,
      show: client.isVatRegistered,
    },
    {
      label: "Self Assessment",
      href: `/clients/${id}/self-assessment`,
      desc: "MTD income tax updates",
      module: "self_assessment" as const,
      show: client.type !== "limited_company",
    },
    {
      label: "Corporation Tax",
      href: `/clients/${id}/corporation-tax`,
      desc: "CT600 XML filing",
      module: "corporation_tax" as const,
      show: isLtd,
    },
    {
      label: "Payroll",
      href: `/clients/${id}/payroll`,
      desc: "Pay runs, FPS & EPS",
      module: "payroll" as const,
      show: client.isEmployer,
    },
  ].filter((m) => m.show && canAccessModule(session.moduleAccess, m.module));

  async function refreshCh() {
    "use server";
    await refreshClientCompaniesHouse(id);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Client workspace
          </p>
          <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
            {client.name}
          </h1>
          <p className="mt-1 capitalize text-ink-soft">
            {client.type.replace("_", " ")}
            {connection.connected ? " · HMRC linked" : " · HMRC not linked"}
          </p>
        </div>
        {session.moduleAccess === "full" && (
          <HmrcConnectButton clientId={id} connected={connection.connected} />
        )}
      </div>

      <ClientTabs
        clientId={id}
        active="overview"
        moduleAccess={session.moduleAccess}
      />

      <div className="space-y-6">
        {/* Top: Identifiers + people */}
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div
            className={`panel p-5 ${
              requiredMissing.length
                ? "border-danger/35 ring-1 ring-danger/20"
                : missingIds.length
                  ? "border-violet/35 ring-1 ring-violet/15"
                  : ""
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="display text-2xl">Identifiers</h2>
              {missingIds.length > 0 && (
                <span
                  className={`badge ${
                    requiredMissing.length
                      ? "border-danger/30 bg-danger/10 text-danger"
                      : "border-violet/30 bg-violet/10 text-violet"
                  }`}
                >
                  {missingIds.length} missing
                </span>
              )}
            </div>
            {requiredMissing.length > 0 && (
              <p className="mt-2 text-sm text-danger">
                Required before filing:{" "}
                {requiredMissing.map((m) => m.label).join(", ")} (
                {[...new Set(requiredMissing.map((m) => m.requiredFor))].join(
                  ", ",
                )}
                ).
              </p>
            )}
            <dl className="mt-4 space-y-1 text-sm">
              {identifiers.map((row) => {
                const empty = !row.value;
                const required = requiredMissing.some(
                  (m) => m.label === row.label,
                );
                return (
                  <div
                    key={row.label}
                    className={`flex justify-between gap-4 border-b border-line/70 py-2.5 ${
                      empty
                        ? required
                          ? "rounded-md border border-danger/40 bg-danger/5 px-2.5"
                          : "rounded-md border border-violet/35 bg-violet/5 px-2.5"
                        : ""
                    }`}
                  >
                    <dt
                      className={
                        empty
                          ? required
                            ? "font-semibold text-danger"
                            : "font-semibold text-violet"
                          : "text-ink-soft"
                      }
                    >
                      {row.label}
                      {required ? " · required" : empty ? " · not set" : ""}
                    </dt>
                    <dd
                      className={`mono font-medium ${
                        empty
                          ? required
                            ? "text-danger"
                            : "text-violet"
                          : "text-ink"
                      }`}
                    >
                      {row.value || "—"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>

          <div className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="display text-2xl">Directors & shareholders</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  From Companies House officers and PSC register
                </p>
              </div>
              {isLtd && (
                <form action={refreshCh}>
                  <button type="submit" className="btn btn-secondary text-sm">
                    {ch ? "Refresh" : "Fetch from CH"}
                  </button>
                </form>
              )}
            </div>

            {!isLtd && (
              <p className="mt-4 text-sm text-ink-soft">
                Director and PSC cards apply to limited companies.
              </p>
            )}

            {isLtd && !ch && (
              <p className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-3 text-sm text-danger">
                No Companies House register loaded yet — fetch to show director
                and shareholder name cards.
              </p>
            )}

            {isLtd && ch && (
              <div className="mt-4 space-y-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
                    Directors ({activeDirectors.length})
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {activeDirectors.map((d) => (
                      <li
                        key={`${d.name}-${d.appointedOn}`}
                        className="rounded-xl border border-line bg-sand/30 px-3 py-3"
                      >
                        <p className="font-semibold text-ink">{d.name}</p>
                        <p className="mt-0.5 text-xs capitalize text-ink-soft">
                          {d.role?.replace(/_/g, " ") ?? "Director"}
                          {d.appointedOn
                            ? ` · appointed ${formatDate(d.appointedOn)}`
                            : ""}
                        </p>
                        {d.nationality && (
                          <p className="mt-1 text-xs text-ink-soft">
                            {d.nationality}
                          </p>
                        )}
                      </li>
                    ))}
                    {!activeDirectors.length && (
                      <li className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-3 text-sm text-danger sm:col-span-2">
                        No active directors on the register snapshot.
                      </li>
                    )}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
                    Shareholders / PSCs ({activePscs.length})
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {activePscs.map((p, i) => (
                      <li
                        key={`${p.name ?? "psc"}-${i}`}
                        className="rounded-xl border border-line bg-white px-3 py-3"
                      >
                        <p className="font-semibold text-ink">
                          {p.name ?? "Person with significant control"}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {p.kind?.replace(/-/g, " ") ?? "PSC"}
                          {p.notifiedOn
                            ? ` · notified ${formatDate(p.notifiedOn)}`
                            : ""}
                        </p>
                        {p.naturesOfControl?.length > 0 && (
                          <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
                            {p.naturesOfControl
                              .map((n) => n.replace(/-/g, " "))
                              .join("; ")}
                          </p>
                        )}
                      </li>
                    ))}
                    {!activePscs.length && (
                      <li className="text-sm text-ink-soft sm:col-span-2">
                        No current PSCs on the register (full share allotments
                        are not always in the public API).
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invoices due */}
        {canAccessModule(session.moduleAccess, "invoices") && (
          <InvoiceSummaryCards
            clientId={id}
            invoices={invoices}
            title="Invoices due"
          />
        )}

        {/* Confirmation statement + Accounts */}
        {isLtd && session.moduleAccess === "full" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div
              className={`panel flex flex-col p-5 ${
                csUrgency === "overdue"
                  ? "client-card--overdue border-danger/40"
                  : csUrgency === "due_soon"
                    ? "client-card--due-soon"
                    : ""
              }`}
            >
              <h2 className="display text-2xl">Confirmation statement</h2>
              <p className={`mt-2 text-sm ${urgencyText(csUrgency)}`}>
                Due {formatDate(ch?.confirmationStatementNextDue)}
                {csUrgency === "overdue"
                  ? " — overdue"
                  : csUrgency === "due_soon"
                    ? " — due within 30 days"
                    : ""}
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                File CS01 with Companies House. Needs company authentication
                code and each director’s personal code.
              </p>
              {!client.companyNumber && (
                <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  Company number missing — add it under Identifiers before
                  filing.
                </p>
              )}
              <div className="mt-auto pt-4">
                <Link href={csHref} className="btn btn-primary w-full text-sm">
                  File confirmation statement
                </Link>
              </div>
            </div>

            <div
              className={`panel flex flex-col p-5 ${
                accountsUrgency === "overdue"
                  ? "client-card--overdue border-danger/40"
                  : accountsUrgency === "due_soon"
                    ? "client-card--due-soon"
                    : ""
              }`}
            >
              <h2 className="display text-2xl">Year-end accounts</h2>
              <p className={`mt-2 text-sm ${urgencyText(accountsUrgency)}`}>
                Due {formatDate(ch?.accountsNextDue)}
                {accountsUrgency === "overdue"
                  ? " — overdue"
                  : accountsUrgency === "due_soon"
                    ? " — due within 30 days"
                    : ""}
              </p>
              <p className="mt-2 text-sm text-ink-soft">
                File accounts with Companies House
                {ch?.accountsPeriodEnd
                  ? ` · period end ${formatDate(ch.accountsPeriodEnd)}`
                  : ""}
                .
              </p>
              {!client.companyNumber && (
                <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  Company number missing — add it under Identifiers before
                  filing.
                </p>
              )}
              <div className="mt-auto pt-4">
                {client.companyNumber ? (
                  <FileAccountsMenu
                    clientId={id}
                    companyNumber={client.companyNumber}
                    className="w-full"
                  />
                ) : (
                  <Link
                    href={accountsHref}
                    className="btn btn-primary w-full text-sm"
                  >
                    File accounts
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Other filing rails */}
        <div>
          <h2 className="display text-2xl">File with HMRC</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Pick a rail — prepare, review, then submit once the client is
            connected.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                className="panel panel-interactive block p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{m.label}</p>
                  <span className="text-sea">→</span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{m.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {session.moduleAccess === "full" && (
          <div className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="display text-2xl">Audit trail</h2>
              <span className="badge badge-muted">Immutable</span>
            </div>
            <ul className="mt-3 divide-y divide-line text-sm">
              {audit.length === 0 && (
                <li className="py-4 text-ink-soft">
                  No events yet — add a book entry or run a filing to start the
                  chain.
                </li>
              )}
              {audit.map((e) => (
                <li
                  key={String(e.id)}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <span className="font-semibold">{String(e.action)}</span>
                  <span className="mono text-xs text-ink-soft">
                    {String(e.createdAt)}
                    {e.hmrcStatusCode != null
                      ? ` · HTTP ${e.hmrcStatusCode}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

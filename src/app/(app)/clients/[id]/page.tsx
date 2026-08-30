import Link from "next/link";
import { getConnectionStatus } from "@/server/actions/hmrc-connect";
import { listClientInvoices } from "@/server/actions/invoices";
import { requireSession } from "@/server/auth/session";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { canAccessModule } from "@/lib/access";
import {
  formatDueShort,
  urgencyForDueDate,
  type FilingUrgency,
} from "@/lib/filing-due";
import { FileAccountsMenu } from "@/components/file-accounts-menu";
import { InvoiceSummaryCards } from "@/components/forms/invoice-workspace";
import { refreshClientCompaniesHouse } from "@/server/actions/clients";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { DeleteClientButton } from "@/components/forms/delete-client-button";

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
  const { id: ref } = await params;
  const { client, slug, clientId } = await loadClientPage(ref);
  const connection = await getConnectionStatus(clientId).catch(() => ({
    connected: false,
    hmrcEnv: "sandbox" as const,
    scopes: "",
  }));
  const invoices = canAccessModule(session.moduleAccess, "invoices")
    ? await listClientInvoices(clientId).catch(() => [])
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
    ...(isLtd
      ? [
          {
            label: "Company authentication code",
            value: client.companyAuthCode,
            requiredFor: "CS01 / CH filings",
          },
        ]
      : []),
    { label: "UTR", value: client.utr, requiredFor: "CT600" },
    { label: "VRN", value: client.vrn, requiredFor: "MTD VAT" },
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
    if (row.label === "Company authentication code") return isLtd && !row.value;
    if (row.label === "UTR") return isLtd && !row.value;
    if (row.label === "VRN") return client.isVatRegistered && !row.value;
    if (row.label === "PAYE" || row.label === "Accounts Office") {
      return client.isEmployer && !row.value;
    }
    return false;
  });

  const activeDirectors = Array.isArray(ch?.directors)
    ? ch.directors.filter((d) => d && !d.resignedOn)
    : [];
  const activePscs = Array.isArray(ch?.pscs)
    ? ch.pscs.filter((p) => p && !p.ceasedOn)
    : [];

  const company = client.companyNumber
    ? encodeURIComponent(client.companyNumber)
    : "";
  const csHref = company
    ? `/companies-house/confirmation-statement?company=${company}&clientId=${encodeURIComponent(clientId)}`
    : "/companies-house/confirmation-statement";
  const accountsHref = company
    ? `/companies-house/accounts-ixbrl?company=${company}&clientId=${encodeURIComponent(clientId)}`
    : "/companies-house/accounts-ixbrl";

  const csUrgency = urgencyForDueDate(ch?.confirmationStatementNextDue);
  const accountsUrgency = urgencyForDueDate(ch?.accountsNextDue);

  async function refreshCh() {
    "use server";
    await refreshClientCompaniesHouse(clientId);
  }

  return (
    <div>
      <div className="space-y-6">
        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="display text-2xl">Contact</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Email and phone used for statements, payroll packs, and
                correspondence.
              </p>
            </div>
            {session.role !== "readonly" && (
              <Link
                href={`/clients/${slug}/edit`}
                className="btn btn-secondary text-sm"
              >
                Edit
              </Link>
            )}
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-ink-soft">Email</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {client.contactEmail || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-soft">Phone</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {"contactPhone" in client &&
                (client as { contactPhone?: string | null }).contactPhone
                  ? (client as { contactPhone?: string | null }).contactPhone
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Top: Identifiers + people */}
        <div
          className={
            activeDirectors.length + activePscs.length <= 2
              ? "space-y-6"
              : "grid gap-6 lg:grid-cols-[0.95fr_1.05fr]"
          }
        >
          <div className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="display text-2xl">Identifiers</h2>
              {session.role !== "readonly" && (
                <Link
                  href={`/clients/${slug}/edit`}
                  className="btn btn-secondary text-sm"
                >
                  Edit
                </Link>
              )}
            </div>
            {missingIds.length > 0 && (
              <span className="mt-2 inline-block rounded-md border border-line bg-sand px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {missingIds.length} missing
              </span>
            )}
            {requiredMissing.length > 0 && (
              <p className="mt-2 text-sm text-ink-soft">
                Add before filing:{" "}
                <span className="font-medium text-ink">
                  {requiredMissing.map((m) => m.label).join(", ")}
                </span>{" "}
                (
                {[...new Set(requiredMissing.map((m) => m.requiredFor))].join(
                  ", ",
                )}
                ).
              </p>
            )}
            <dl className="mt-4 divide-y divide-line text-sm">
              {identifiers.map((row) => {
                const empty = !row.value;
                const required = requiredMissing.some(
                  (m) => m.label === row.label,
                );
                return (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-4 py-2.5"
                  >
                    <dt className="text-ink-soft">
                      {row.label}
                      {required ? (
                        <span className="ml-1.5 text-xs font-medium text-ink">
                          Required
                        </span>
                      ) : empty ? (
                        <span className="ml-1.5 text-xs text-ink-soft/80">
                          Optional
                        </span>
                      ) : null}
                    </dt>
                    <dd
                      className={`mono text-right font-medium ${
                        empty ? "text-ink-soft" : "text-ink"
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
                  <ul className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
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
                      <li className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-3 text-sm text-danger">
                        No active directors on the register snapshot.
                      </li>
                    )}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
                    Shareholders / PSCs ({activePscs.length})
                  </p>
                  <ul className="mt-2 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
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
                        {Array.isArray(p.naturesOfControl) &&
                          p.naturesOfControl.length > 0 && (
                          <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
                            {p.naturesOfControl
                              .map((n) => String(n).replace(/-/g, " "))
                              .join("; ")}
                          </p>
                        )}
                      </li>
                    ))}
                    {!activePscs.length && (
                      <li className="text-sm text-ink-soft">
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
            clientId={clientId}
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
                    clientId={clientId}
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

        {session.role !== "readonly" && (
          <DeleteClientButton clientId={clientId} clientName={client.name} />
        )}
      </div>
    </div>
  );
}

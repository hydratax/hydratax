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
import { YearEndFiledActionsMenu } from "@/components/year-end-actions-menu";
import { InvoiceSummaryCards } from "@/components/forms/invoice-workspace";
import { refreshClientCompaniesHouse } from "@/server/actions/clients";
import { listCt600Returns } from "@/server/actions/ct600";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { DeleteClientButton } from "@/components/forms/delete-client-button";
import { listPracticeDirectors } from "@/server/actions/sa-directors";
import { SaOverviewDirectorsCard } from "@/components/forms/sa-overview-directors-card";
import { ClientWorkStagePanel } from "@/components/forms/client-work-stage-panel";
import { ClientWorkingLogs } from "@/components/client-working-logs";
import { listClientEmailLogs } from "@/server/actions/client-communications";
import { normalizeWorkStage } from "@/lib/client-work-stage";

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
  const ct600Returns = await listCt600Returns(clientId).catch(() => []);
  const practiceDirectors = await listPracticeDirectors().catch(() => []);
  const emailLogs = await listClientEmailLogs(clientId).catch(() => []);
  const workStage = normalizeWorkStage(client.deskProfile?.workStage);
  const workLog = client.deskProfile?.workLog ?? [];
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;
  const isLtd = client.type === "limited_company";
  // Only people linked to THIS company — never the whole practice list.
  const overviewDirectors = isLtd
    ? practiceDirectors.filter((d) =>
        d.companies.some((c) => c.clientId === clientId),
      )
    : practiceDirectors;
  const lastMadeUp = ch?.lastAccountsMadeUpTo ?? null;
  const filedReturn =
    lastMadeUp != null
      ? ct600Returns.find(
          (r) =>
            r.periodEnd === lastMadeUp &&
            ["submitted", "accepted", "ready"].includes(r.status),
        ) ??
        ct600Returns.find((r) => r.periodEnd === lastMadeUp) ??
        null
      : null;

  const identifiers: Array<{
    label: string;
    value: string | null | undefined;
  }> = [
    {
      label: "Company number",
      value: client.companyNumber,
    },
    ...(isLtd
      ? [
          {
            label: "Company authentication code",
            value: client.companyAuthCode,
          },
        ]
      : []),
    { label: "UTR", value: client.utr },
    { label: "VRN", value: client.vrn },
    { label: "PAYE", value: client.payeRef },
    {
      label: "Accounts Office",
      value: client.accountsOfficeRef,
    },
    { label: "Email", value: client.contactEmail },
    {
      label: "Phone",
      value:
        "contactPhone" in client
          ? ((client as { contactPhone?: string | null }).contactPhone ?? null)
          : null,
    },
  ];

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
            <dl className="mt-4 divide-y divide-line text-sm">
              {identifiers.map((row) => {
                const empty = !row.value;
                const mono =
                  row.label !== "Email" && row.label !== "Phone";
                return (
                  <div
                    key={row.label}
                    className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-baseline gap-x-4 py-2.5"
                  >
                    <dt className="text-ink-soft">{row.label}</dt>
                    <dd
                      className={`truncate text-right font-medium ${
                        mono ? "mono" : ""
                      } ${empty ? "text-ink-soft" : "text-ink"}`}
                      title={row.value || undefined}
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

        {/* Confirmation statement + Accounts + Self Assessment */}
        {isLtd && session.moduleAccess === "full" && (
          <div className="grid gap-4 lg:grid-cols-3 md:grid-cols-2">
            <SaOverviewDirectorsCard
              clientSlug={slug}
              directors={overviewDirectors}
            />
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
              {filedReturn && lastMadeUp ? (
                <>
                  <p className="mt-2 text-sm font-semibold text-sea">
                    Filed to {formatDate(lastMadeUp)}
                  </p>
                  <p className="mt-2 text-sm text-ink-soft">
                    Next accounts due {formatDate(ch?.accountsNextDue)}
                    {ch?.accountsPeriodEnd
                      ? ` · period end ${formatDate(ch.accountsPeriodEnd)}`
                      : ""}
                    .
                  </p>
                </>
              ) : (
                <>
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
                </>
              )}
              {!client.companyNumber && (
                <p className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                  Company number missing — add it under Identifiers before
                  filing.
                </p>
              )}
              <div className="mt-auto pt-4">
                {client.companyNumber && filedReturn && lastMadeUp ? (
                  <YearEndFiledActionsMenu
                    label="Filed actions"
                    className="w-full bg-sea text-white hover:bg-sea/90"
                    filed={{
                      clientId,
                      returnId: filedReturn.id,
                      periodStart: filedReturn.periodStart,
                      periodEnd: filedReturn.periodEnd,
                      companyNumber: client.companyNumber,
                    }}
                  />
                ) : client.companyNumber ? (
                  <FileAccountsMenu
                    clientId={clientId}
                    companyNumber={client.companyNumber}
                    className="w-full bg-sea text-white hover:bg-sea/90"
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

        {canAccessModule(session.moduleAccess, "invoices") && (
          <InvoiceSummaryCards
            clientId={clientId}
            invoices={invoices}
            title="Invoices due"
          />
        )}

        <ClientWorkStagePanel
          clientId={clientId}
          stage={workStage}
          readOnly={session.role === "readonly"}
        />

        <ClientWorkingLogs
          workLog={workLog}
          emails={emailLogs.map((l) => ({
            id: l.id,
            subject: l.subject,
            toEmail: l.toEmail,
            createdAt: l.createdAt,
            kind: l.kind,
          }))}
          stage={workStage}
        />

        {session.role !== "readonly" && (
          <DeleteClientButton clientId={clientId} clientName={client.name} />
        )}
      </div>
    </div>
  );
}

import Link from "next/link";
import { refreshClientCompaniesHouse } from "@/server/actions/clients";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  formatDueShort,
  urgencyForDueDate,
  type FilingUrgency,
} from "@/lib/filing-due";

function formatDate(iso: string | null | undefined) {
  return formatDueShort(iso) ?? "—";
}

function urgencyClass(u: FilingUrgency) {
  if (u === "overdue") return "text-danger font-semibold";
  if (u === "due_soon") return "text-violet font-semibold";
  return "font-medium text-ink";
}

function DueRow({
  label,
  dueIso,
}: {
  label: string;
  dueIso: string | null | undefined;
}) {
  const urgency = urgencyForDueDate(dueIso);
  const suffix =
    urgency === "overdue"
      ? " · Overdue"
      : urgency === "due_soon"
        ? " · Due soon"
        : "";
  return (
    <div className="flex justify-between gap-4 border-b border-line/70 py-2.5">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`text-right ${urgencyClass(urgency)}`}>
        {formatDate(dueIso)}
        {suffix}
      </dd>
    </div>
  );
}

export function ClientCompaniesHousePanel({
  clientId,
  snapshot,
}: {
  clientId: string;
  snapshot: ClientCompaniesHouseSnapshot | null | undefined;
}) {
  async function refresh() {
    "use server";
    await refreshClientCompaniesHouse(clientId);
  }

  if (!snapshot) {
    return (
      <div className="panel p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-2xl">Companies House</h2>
          <form action={refresh}>
            <button type="submit" className="btn btn-secondary text-sm">
              Fetch from Companies House
            </button>
          </form>
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          No register data stored yet for this company.
        </p>
      </div>
    );
  }

  const directors = snapshot.directors ?? [];
  const pscs = snapshot.pscs ?? [];
  const csUrgency = urgencyForDueDate(snapshot.confirmationStatementNextDue);
  const accountsUrgency = urgencyForDueDate(snapshot.accountsNextDue);
  const company = encodeURIComponent(snapshot.companyNumber);

  const csHref = `/companies-house/confirmation-statement?company=${company}&clientId=${encodeURIComponent(clientId)}`;
  const accountsHref = `/companies-house/accounts-ixbrl?company=${company}&clientId=${encodeURIComponent(clientId)}`;

  return (
    <div className="space-y-4 lg:col-span-2">
      <div
        className={`panel p-5 ${
          csUrgency === "overdue" || accountsUrgency === "overdue"
            ? "client-card--overdue"
            : csUrgency === "due_soon" || accountsUrgency === "due_soon"
              ? "client-card--due-soon"
              : ""
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="display text-2xl">Companies House</h2>
            <p className="mono mt-1 text-xs text-ink-soft">
              {snapshot.companyNumber}
              {snapshot.companyStatus ? ` · ${snapshot.companyStatus}` : ""}
            </p>
          </div>
          <form action={refresh}>
            <button type="submit" className="btn btn-secondary text-sm">
              Refresh
            </button>
          </form>
        </div>

        <dl className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2 text-sm">
          <div className="flex justify-between gap-4 border-b border-line/70 py-2.5">
            <dt className="text-ink-soft">Incorporated</dt>
            <dd className="text-right font-medium text-ink">
              {formatDate(snapshot.incorporatedOn)}
            </dd>
          </div>
          <DueRow label="Accounts due" dueIso={snapshot.accountsNextDue} />
          <div className="flex justify-between gap-4 border-b border-line/70 py-2.5">
            <dt className="text-ink-soft">Accounts period end</dt>
            <dd className="text-right font-medium text-ink">
              {formatDate(snapshot.accountsPeriodEnd)}
            </dd>
          </div>
          <DueRow
            label="Confirmation statement due"
            dueIso={snapshot.confirmationStatementNextDue}
          />
          <div className="flex justify-between gap-4 border-b border-line/70 py-2.5">
            <dt className="text-ink-soft">Confirmation last made up</dt>
            <dd className="text-right font-medium text-ink">
              {formatDate(snapshot.confirmationStatementLastMadeUpTo)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-line/70 py-2.5 sm:col-span-2">
            <dt className="text-ink-soft">Registered office</dt>
            <dd className="text-right font-medium text-ink">
              {snapshot.registeredOffice ?? "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div
            className={`rounded-lg border p-4 ${
              csUrgency === "overdue"
                ? "border-danger/40 bg-danger/5"
                : csUrgency === "due_soon"
                  ? "border-violet/40 bg-[rgba(109,40,217,0.06)]"
                  : "border-line"
            }`}
          >
            <p className="font-semibold text-ink">Confirmation statement</p>
            <p className={`mt-1 text-sm ${urgencyClass(csUrgency)}`}>
              Due {formatDate(snapshot.confirmationStatementNextDue)}
              {csUrgency === "overdue"
                ? " — overdue"
                : csUrgency === "due_soon"
                  ? " — due within 30 days"
                  : ""}
            </p>
            <Link href={csHref} className="btn btn-primary mt-3 w-full text-sm">
              {csUrgency === "overdue" || csUrgency === "due_soon"
                ? "File confirmation statement"
                : "File CS01"}
            </Link>
          </div>

          <div
            className={`rounded-lg border p-4 ${
              accountsUrgency === "overdue"
                ? "border-danger/40 bg-danger/5"
                : accountsUrgency === "due_soon"
                  ? "border-violet/40 bg-[rgba(109,40,217,0.06)]"
                  : "border-line"
            }`}
          >
            <p className="font-semibold text-ink">Year-end accounts</p>
            <p className={`mt-1 text-sm ${urgencyClass(accountsUrgency)}`}>
              Due {formatDate(snapshot.accountsNextDue)}
              {accountsUrgency === "overdue"
                ? " — overdue"
                : accountsUrgency === "due_soon"
                  ? " — due within 30 days"
                  : ""}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Period end {formatDate(snapshot.accountsPeriodEnd)}
            </p>
            <Link
              href={accountsHref}
              className="btn btn-primary mt-3 w-full text-sm"
            >
              {accountsUrgency === "overdue" || accountsUrgency === "due_soon"
                ? "File year-end accounts"
                : "File iXBRL accounts"}
            </Link>
          </div>
        </div>

        <p className="mt-3 text-xs text-ink-soft">
          <Link
            href={`https://find-and-update.company-information.service.gov.uk/company/${snapshot.companyNumber}`}
            className="font-semibold text-sea"
            target="_blank"
            rel="noreferrer"
          >
            View on Companies House →
          </Link>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="font-semibold text-ink">
            Directors / officers ({directors.length})
          </h3>
          <ul className="mt-3 max-h-72 space-y-3 overflow-auto text-sm">
            {directors.length === 0 && (
              <li className="text-ink-soft">No officers returned.</li>
            )}
            {directors.map((d) => (
              <li
                key={`${d.name}-${d.appointedOn}`}
                className="border-b border-line/60 pb-2"
              >
                <p className="font-semibold text-ink">{d.name}</p>
                <p className="text-ink-soft">
                  {[
                    d.role,
                    d.appointedOn && `appointed ${formatDate(d.appointedOn)}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <h3 className="font-semibold text-ink">
            PSC / ownership ({pscs.length})
          </h3>
          <ul className="mt-3 max-h-72 space-y-3 overflow-auto text-sm">
            {pscs.length === 0 && (
              <li className="text-ink-soft">No PSC records returned.</li>
            )}
            {pscs.map((p, i) => (
              <li
                key={`${p.name}-${i}`}
                className="border-b border-line/60 pb-2"
              >
                <p className="font-semibold text-ink">{p.name ?? "—"}</p>
                <p className="text-ink-soft">
                  {(p.naturesOfControl ?? []).join("; ") || p.kind || "—"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

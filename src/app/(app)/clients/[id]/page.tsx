import Link from "next/link";
import { getClient } from "@/server/actions/clients";
import { getConnectionStatus } from "@/server/actions/hmrc-connect";
import { ClientTabs } from "@/components/client-tabs";
import { HmrcConnectButton } from "@/components/forms/hmrc-connect-button";
import { listAuditEvents } from "@/server/audit/log";

export default async function ClientOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await getClient(id);
  const connection = await getConnectionStatus(id);
  const audit = await listAuditEvents({ clientId: id, limit: 8 });

  const modules = [
    {
      label: "Books",
      href: `/clients/${id}/books`,
      desc: "Income & expenses in pence",
      show: true,
    },
    {
      label: "Bank",
      href: `/clients/${id}/bank`,
      desc: "Statements → SA / CT drafts",
      show: true,
    },
    {
      label: "Documents",
      href: `/clients/${id}/documents`,
      desc: "Upload working papers",
      show: true,
    },
    {
      label: "VAT",
      href: `/clients/${id}/vat`,
      desc: "Prepare → review → submit",
      show: client.isVatRegistered,
    },
    {
      label: "Self Assessment",
      href: `/clients/${id}/self-assessment`,
      desc: "MTD income tax updates",
      show: client.type !== "limited_company",
    },
    {
      label: "Corporation Tax",
      href: `/clients/${id}/corporation-tax`,
      desc: "CT600 XML filing",
      show: client.type === "limited_company",
    },
    {
      label: "Payroll",
      href: `/clients/${id}/payroll`,
      desc: "Pay runs, FPS & EPS",
      show: client.isEmployer,
    },
  ].filter((m) => m.show);

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
        <HmrcConnectButton clientId={id} connected={connection.connected} />
      </div>

      <ClientTabs clientId={id} active="overview" />

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="panel p-5">
          <h2 className="display text-2xl">Identifiers</h2>
          <dl className="mt-4 space-y-1 text-sm">
            {[
              ["Company number", client.companyNumber],
              ["UTR", client.utr],
              ["VRN", client.vrn],
              ["NINO", client.nino],
              ["PAYE", client.payeRef],
              ["Accounts Office", client.accountsOfficeRef],
            ].map(([label, value]) => (
              <div
                key={label}
                className="flex justify-between gap-4 border-b border-line/70 py-2.5"
              >
                <dt className="text-ink-soft">{label}</dt>
                <dd className="mono font-medium">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="display text-2xl">File with HMRC</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Pick a rail — prepare, review, then submit to HMRC once the client
              is connected. Upload source papers under Documents first.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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

        <div className="panel p-5 lg:col-span-2">
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
      </div>
    </div>
  );
}

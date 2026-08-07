import Link from "next/link";
import { listClients } from "@/server/actions/clients";

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Practice
          </p>
          <h1 className="display mt-1 text-4xl text-ink md:text-5xl">Clients</h1>
          <p className="mt-1 text-ink-soft">
            Every entity your practice files for — open a workspace to start.
          </p>
        </div>
        <Link href="/clients/new" className="btn btn-primary">
          Add client
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="panel panel-interactive block p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="display text-2xl text-ink">{c.name}</h2>
                <p className="mt-1 capitalize text-sm text-ink-soft">
                  {c.type.replace("_", " ")}
                </p>
              </div>
              <span className="text-sm font-semibold text-sea">Open →</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {c.isVatRegistered && <span className="badge badge-sea">VAT</span>}
              {c.isEmployer && <span className="badge badge-muted">PAYE</span>}
              {c.type === "limited_company" && (
                <span className="badge badge-muted">CT600</span>
              )}
              {c.type !== "limited_company" && (
                <span className="badge badge-muted">Self Assessment</span>
              )}
            </div>
            <p className="mono mt-3 text-xs text-ink-soft">
              {[c.vrn && `VRN ${c.vrn}`, c.utr && `UTR ${c.utr}`, c.companyNumber]
                .filter(Boolean)
                .join(" · ") || "No identifiers yet"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

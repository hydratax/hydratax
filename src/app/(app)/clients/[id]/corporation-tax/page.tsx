import { getClient } from "@/server/actions/clients";
import { listCt600Returns } from "@/server/actions/ct600";
import { requireModule } from "@/server/auth/session";
import { ClientTabs } from "@/components/client-tabs";
import { Ct600Form } from "@/components/forms/ct600-form";
import { money } from "@/lib/format";
import { redirect } from "next/navigation";

export default async function CorporationTaxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let session;
  try {
    session = await requireModule("corporation_tax");
  } catch {
    redirect("/clients");
  }
  const { id } = await params;
  const client = await getClient(id);
  const returns = await listCt600Returns(id);

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        CT600 · UTR {client.utr ?? "not set"} · Co.{" "}
        {client.companyNumber ?? "not set"}
      </p>
      <ClientTabs
        clientId={id}
        active="corporation-tax"
        moduleAccess={session.moduleAccess}
      />

      {client.type !== "limited_company" ? (
        <div className="panel p-5 text-ink-soft">
          Corporation Tax CT600 is for limited companies.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="panel p-5">
            <h2 className="display text-2xl">File CT600</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Trial balance → CT figures → HMRC checklist → XML → submit.
            </p>
            <div className="mt-4">
              <Ct600Form clientId={id} />
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="display text-2xl">Returns</h2>
            <ul className="mt-3 divide-y divide-line text-sm">
              {returns.length === 0 && (
                <li className="py-3 text-ink-soft">No CT600 returns yet.</li>
              )}
              {returns.map((r) => (
                <li key={String(r.id)} className="py-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">
                      {String(r.periodStart)} → {String(r.periodEnd)}
                    </span>
                    <span className="badge badge-ok">{String(r.status)}</span>
                  </div>
                  {"taxableProfitPence" in r && (
                    <p className="mono text-ink-soft">
                      Taxable {money(Number(r.taxableProfitPence))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

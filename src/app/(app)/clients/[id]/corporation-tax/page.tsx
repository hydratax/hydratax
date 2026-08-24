import { listCt600Returns } from "@/server/actions/ct600";
import { requireModule } from "@/server/auth/session";
import { ClientTabs } from "@/components/client-tabs";
import { Ct600Form } from "@/components/forms/ct600-form";
import { money } from "@/lib/format";
import { redirect } from "next/navigation";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import {
  companiesHouseAccountsPeriod,
  corporationTaxAccountingPeriods,
} from "@/lib/accounting-periods";

export default async function CorporationTaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ note?: string; start?: string; end?: string }>;
}) {
  let session;
  try {
    session = await requireModule("corporation_tax");
  } catch {
    redirect("/clients");
  }
  const { id: ref } = await params;
  const query = await searchParams;
  const { client, slug, clientId } = await loadClientPage(ref, "corporation-tax");
  const returns = await listCt600Returns(clientId).catch(() => []);
  const filedElsewhere = query.note === "filed-elsewhere";
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;
  const poa = companiesHouseAccountsPeriod({
    incorporatedOn: ch?.incorporatedOn,
    accountsPeriodEnd: ch?.accountsPeriodEnd,
    lastAccountsMadeUpTo: ch?.lastAccountsMadeUpTo,
  });
  const ctPeriods = corporationTaxAccountingPeriods(poa);
  const selected =
    query.start && query.end
      ? ctPeriods.find((p) => p.start === query.start && p.end === query.end) ??
        ctPeriods[0]
      : ctPeriods[0];

  return (
    <div>
      <h1 className="display text-4xl text-ink">{client.name}</h1>
      <p className="mt-1 text-ink-soft">
        Corporation Tax · UTR {client.utr ?? "not set"} · Co.{" "}
        {client.companyNumber ?? "not set"}
      </p>
      <ClientTabs
        clientSlug={slug}
        active="corporation-tax"
        moduleAccess={session.moduleAccess}
      />

      {filedElsewhere && (
        <div className="mb-4 rounded-xl border border-sea/30 bg-sea/5 px-4 py-3 text-sm text-ink">
          <p className="font-semibold text-ink">CT600 filed elsewhere</p>
          <p className="mt-1 text-ink-soft">
            If this return was submitted outside HydraTax, keep a note on the
            client documents and continue with the current period when HMRC
            allows. Use the filing form below only for returns you still need to
            send through Hydra.
          </p>
        </div>
      )}

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
              <Ct600Form
                key={`${selected?.start ?? poa.start}-${selected?.end ?? poa.end}`}
                clientId={clientId}
                defaultPeriodStart={selected?.start ?? poa.start}
                defaultPeriodEnd={selected?.end ?? poa.end}
              />
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

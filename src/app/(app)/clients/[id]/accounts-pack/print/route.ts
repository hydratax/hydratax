import { getYearEndAccountsDraftFromBank } from "@/server/actions/bank";
import { requireSession } from "@/server/auth/session";
import { renderYearEndAccountsHtml } from "@/server/accounts/render-pack-html";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import {
  companiesHouseAccountsPeriod,
  parseComparatives,
} from "@/lib/accounting-periods";
import { priorFiguresForStatements } from "@/server/accounts/year-end-from-bank";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id: ref } = await context.params;
  const { client, clientId } = await loadClientPage(ref, "accounts-pack/print");
  const url = new URL(request.url);
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;
  const poa = companiesHouseAccountsPeriod({
    incorporatedOn: ch?.incorporatedOn,
    accountsPeriodEnd: ch?.accountsPeriodEnd,
    lastAccountsMadeUpTo: ch?.lastAccountsMadeUpTo,
  });
  const periodEnd =
    url.searchParams.get("end") &&
    /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("end")!)
      ? url.searchParams.get("end")!
      : poa.end;
  const periodStart =
    url.searchParams.get("start") &&
    /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("start")!)
      ? url.searchParams.get("start")!
      : poa.start;

  const draft = await getYearEndAccountsDraftFromBank(
    clientId,
    periodStart,
    periodEnd,
  );
  const showPriorYear = !poa.firstYear;
  const comps = parseComparatives(
    "accountsComparatives" in client ? client.accountsComparatives : null,
  );
  const priorFigs = showPriorYear
    ? priorFiguresForStatements(comps)
    : null;

  const directors =
    ch?.directors
      ?.filter((d) => !d.resignedOn)
      .map((d) => d.name)
      .filter(Boolean) ?? [];

  const officeLines = (ch?.registeredOffice ?? "")
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sic = ch?.sicCodes?.[0];
  const principalActivity = sic
    ? `activities under SIC ${sic}`
    : "business support services";

  const html = renderYearEndAccountsHtml(
    {
      name: client.name,
      companyNumber: client.companyNumber ?? ch?.companyNumber ?? "",
      registeredOffice: officeLines,
      directors: directors.length ? directors : ["Director"],
      principalActivity,
      accountantsName: "HydraTax",
      bankers: "Monzo Bank",
      approvalDate: new Date().toISOString().slice(0, 10),
    },
    draft,
    priorFigs
      ? {
          turnoverPence: priorFigs.turnoverPence ?? undefined,
          costOfSalesPence: priorFigs.costOfSalesPence ?? undefined,
          grossProfitPence: priorFigs.grossProfitPence ?? undefined,
          adminExpensesPence: priorFigs.adminExpensesPence ?? undefined,
          profitBeforeTaxPence: priorFigs.profitBeforeTaxPence ?? undefined,
          taxationPence: priorFigs.taxationPence ?? undefined,
          profitAfterTaxPence: priorFigs.profitAfterTaxPence ?? undefined,
          dividendsPence: priorFigs.dividendsPence ?? undefined,
          retainedBroughtForwardPence: priorFigs.retainedBroughtForwardPence,
          retainedCarriedForwardPence: priorFigs.retainedCarriedForwardPence,
          balanceSheet: priorFigs.balanceSheet,
        }
      : null,
    { showPriorYear },
  );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

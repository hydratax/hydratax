import { getClient } from "@/server/actions/clients";
import { getYearEndAccountsDraftFromBank } from "@/server/actions/bank";
import { requireSession } from "@/server/auth/session";
import { renderYearEndAccountsHtml } from "@/server/accounts/render-pack-html";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

function defaultPeriodEnd() {
  const now = new Date();
  const y =
    now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${y}-03-31`;
}

function defaultPeriodStart(end: string) {
  const d = new Date(`${end}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await requireSession();
  const { id } = await context.params;
  const url = new URL(request.url);
  const periodEnd =
    url.searchParams.get("end") &&
    /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("end")!)
      ? url.searchParams.get("end")!
      : defaultPeriodEnd();
  const periodStart =
    url.searchParams.get("start") &&
    /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("start")!)
      ? url.searchParams.get("start")!
      : defaultPeriodStart(periodEnd);

  const client = await getClient(id);
  const draft = await getYearEndAccountsDraftFromBank(
    id,
    periodStart,
    periodEnd,
  );
  const ch =
    ("companiesHouse" in client
      ? (client.companiesHouse as ClientCompaniesHouseSnapshot | null)
      : null) ?? null;

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
    : "business services";

  const html = renderYearEndAccountsHtml(
    {
      name: client.name,
      companyNumber: client.companyNumber ?? ch?.companyNumber ?? "",
      registeredOffice: officeLines,
      directors: directors.length ? directors : ["Director"],
      principalActivity,
      accountantsName: "HydraTax",
      bankers: "—",
      approvalDate: new Date().toISOString().slice(0, 10),
    },
    draft,
  );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/server/auth/session";
import { loadClientPage } from "@/server/clients/resolve-client-page";
import { getSa800Draft, listSa800Returns } from "@/server/actions/sa800";
import { Sa800Wizard } from "@/components/forms/sa800-wizard";
import { TAX_YEAR_LABEL } from "@/lib/sa100/rates-2025-26";
import { SA800_TEMPLATES } from "@/lib/sa800/forms";

export default async function PartnershipReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  try {
    await requireModule("self_assessment");
  } catch {
    redirect("/clients");
  }

  const { id: ref } = await params;
  const query = await searchParams;
  const { client, clientId, slug } = await loadClientPage(ref, "sa800");
  const taxYear =
    query.year?.trim() ||
    SA800_TEMPLATES[0]?.taxYear ||
    TAX_YEAR_LABEL;

  if (client.type !== "partnership") {
    return (
      <div className="space-y-3">
        <h1 className="display text-3xl text-ink">Partnership return</h1>
        <p className="max-w-xl text-sm text-ink-soft">
          SA800 is for partnership clients. This client is recorded as{" "}
          {client.type.replace(/_/g, " ")}. Create a partnership client, or
          use{" "}
          <Link
            href={`/clients/${slug}/self-assessment`}
            className="font-semibold text-sea"
          >
            Self Assessment
          </Link>{" "}
          for personal returns (including SA104 partnership income).
        </p>
      </div>
    );
  }

  const [draft, history] = await Promise.all([
    getSa800Draft(clientId, taxYear),
    listSa800Returns(clientId),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-3xl text-ink">Partnership return (SA800)</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          Entity return for {client.name}. Fill the draft and download the
          official SA800 stationery with your figures overlaid (tax years
          2022–23 to 2025–26). Each partner still files their personal SA100
          with SA104 for their share.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {SA800_TEMPLATES.map((t) => (
          <Link
            key={t.taxYear}
            href={`/clients/${slug}/sa800?year=${t.taxYear}`}
            className={
              t.taxYear === taxYear
                ? "rounded-md bg-ink px-3 py-1.5 font-semibold text-white"
                : "rounded-md border border-line px-3 py-1.5 font-semibold text-ink-soft hover:text-ink"
            }
          >
            {t.taxYear}
          </Link>
        ))}
      </div>
      {history.length > 0 ? (
        <ul className="text-sm text-ink-soft">
          {history.map((r) => (
            <li key={r.id}>
              {r.taxYear} · {r.status}
              {r.taxYear !== taxYear ? (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    href={`/clients/${slug}/sa800?year=${r.taxYear}`}
                    className="font-semibold text-sea"
                  >
                    Open
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <Sa800Wizard
        key={taxYear}
        clientId={clientId}
        clientName={client.name}
        initial={draft}
        taxYear={taxYear}
      />
    </div>
  );
}

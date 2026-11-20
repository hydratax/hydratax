import { listClients } from "@/server/actions/clients";
import { listPracticeDirectors } from "@/server/actions/sa-directors";
import { clientSlugFor } from "@/lib/client-slug";

type ClientRow = Awaited<ReturnType<typeof listClients>>[number];

/** Directors + sole traders/partners with filing chips for SA desk cards. */
export async function loadSaDeskRows(clients: ClientRow[]) {
  const { listSa100Returns } = await import("@/server/actions/sa100");
  const { filingSaTaxYear, saFilingUrgency } = await import(
    "@/lib/sa-tax-year"
  );
  const { countEmailsByClientIds } = await import(
    "@/server/actions/client-communications"
  );
  const { normalizeWorkStage } = await import("@/lib/client-work-stage");
  const peers = clients.map((c) => ({ id: c.id, name: c.name }));
  const filingYear = filingSaTaxYear();

  const [directorsRaw, soleBase] = await Promise.all([
    listPracticeDirectors().catch(() => []),
    Promise.resolve(
      clients
        .filter((c) => c.type === "sole_trader" || c.type === "partnership")
        .map((c) => ({
          id: c.id,
          slug: clientSlugFor({ id: c.id, name: c.name }, peers),
          name: c.name,
          type: c.type,
          utr: c.utr,
          nino: c.nino,
          workStage: normalizeWorkStage(c.deskProfile?.workStage),
        })),
    ),
  ]);

  const emailClientIds = [
    ...soleBase.map((c) => c.id),
    ...directorsRaw.map((d) => d.homeClientId),
  ];
  const emailCounts = await countEmailsByClientIds(emailClientIds).catch(
    () => ({}) as Record<string, number>,
  );

  const directors = directorsRaw.map((d) => {
    const home = clients.find((c) => c.id === d.homeClientId);
    return {
      ...d,
      workStage: normalizeWorkStage(home?.deskProfile?.workStage),
      emailCount: emailCounts[d.homeClientId] ?? 0,
    };
  });

  const soleTraders = await Promise.all(
    soleBase.map(async (c) => {
      const returns = await listSa100Returns(c.id).catch(() => []);
      const match =
        returns.find((r) => r.taxYear === filingYear.label) ?? null;
      const status = match
        ? match.status === "accepted"
          ? ("accepted" as const)
          : match.status === "submitted"
            ? ("submitted" as const)
            : ("draft" as const)
        : ("none" as const);
      return {
        ...c,
        emailCount: emailCounts[c.id] ?? 0,
        filing: {
          taxYear: filingYear.label,
          filingDue: filingYear.filingDue,
          status,
          urgency: saFilingUrgency(filingYear, status),
        },
      };
    }),
  );

  return { directors, soleTraders };
}

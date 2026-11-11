import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { listClients } from "@/server/actions/clients";
import { listPracticeDirectors } from "@/server/actions/sa-directors";
import { listSaTaxpayers } from "@/server/actions/sa-taxpayers";
import {
  SaBulkPriorReturns,
  type SaBulkPersonOption,
} from "@/components/forms/sa-bulk-prior-returns";

export const metadata = { title: "Bulk prior SA returns — HydraTax" };

export default async function BulkPriorSaReturnsPage() {
  await requireSession();
  const [directors, clients] = await Promise.all([
    listPracticeDirectors().catch(() => []),
    listClients().catch(() => []),
  ]);

  const people: SaBulkPersonOption[] = [];
  const seen = new Set<string>();

  for (const d of directors) {
    if (!d.taxpayer?.id) continue;
    const key = `dir:${d.key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({
      key,
      label: `${d.fullName} (director / SA)`,
      clientId: d.homeClientId,
      taxpayerId: d.taxpayer.id,
    });
  }

  for (const c of clients) {
    if (c.type !== "sole_trader" && c.type !== "partnership") continue;
    const taxpayers = await listSaTaxpayers(c.id).catch(() => []);
    if (taxpayers.length === 0) {
      const key = `client:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      people.push({
        key,
        label: c.name,
        clientId: c.id,
        taxpayerId: null,
      });
      continue;
    }
    for (const t of taxpayers) {
      const key = `tp:${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      people.push({
        key,
        label: `${t.fullName} · ${c.name}`,
        clientId: c.id,
        taxpayerId: t.id,
      });
    }
  }

  people.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
            Self Assessment
          </p>
          <h1 className="display mt-1 text-4xl text-ink">
            Bulk prior returns
          </h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Attach last year’s SA100 and SA302 PDFs for many clients in one
            pass. Each file is stored on the person desk and shows on that tax
            year card.
          </p>
        </div>
        <Link href="/dashboard" className="btn btn-secondary text-sm">
          ← Dashboard
        </Link>
      </div>

      <SaBulkPriorReturns people={people} />
    </div>
  );
}

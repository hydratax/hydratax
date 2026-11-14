"use client";

import { PendingLink } from "@/components/pending-link";
import { maskUtr } from "@/lib/mask-identifiers";

export type PartnershipDeskItem = {
  id: string;
  slug: string;
  name: string;
  utr: string | null;
};

export function PartnershipDeskList({
  partnerships,
}: {
  partnerships: PartnershipDeskItem[];
}) {
  if (partnerships.length === 0) return null;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {partnerships.map((p) => (
        <li key={p.id}>
          <PendingLink
            href={`/clients/${p.slug}/sa800`}
            pendingLabel={`Opening SA800 for ${p.name}…`}
            className="service-tile group block"
          >
            {(pending) => (
              <>
                <span className="service-tile__sheen" aria-hidden />
                <div className="relative z-[1] flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-sea">
                      Partnership
                    </p>
                    <p className="display mt-1 text-lg text-ink">{p.name}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {p.utr ? `UTR ${maskUtr(p.utr)}` : "Partnership return (SA800)"}
                    </p>
                  </div>
                  <span
                    className={`open-chip open-chip--sm shrink-0 ${
                      pending ? "is-pending" : ""
                    }`}
                  >
                    {pending ? "…" : "SA800"}
                  </span>
                </div>
              </>
            )}
          </PendingLink>
        </li>
      ))}
    </ul>
  );
}

import { permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";
import {
  fetchClientRecord,
  listClientIdNames,
  type ClientRecord,
} from "@/server/actions/clients";
import { clientSlugFor, isClientUuid } from "@/lib/client-slug";
import { requireSession } from "@/server/auth/session";

export type ResolvedClientPage = {
  client: ClientRecord;
  slug: string;
  clientId: string;
};

const listClientIdNamesCached = cache(async () => listClientIdNames());
const fetchClientRecordCached = cache(async (clientId: string) =>
  fetchClientRecord(clientId),
);

export const resolveClientFromRef = cache(
  async (ref: string): Promise<ResolvedClientPage> => {
    const session = await requireSession();
    const peers = await listClientIdNamesCached();

    const peerMatch = isClientUuid(ref)
      ? peers.find((c) => c.id === ref)
      : peers.find((c) => clientSlugFor(c, peers) === ref);

    if (!peerMatch) {
      const { notFound } = await import("next/navigation");
      notFound();
      throw new Error("Client not found");
    }

    const client = await fetchClientRecordCached(peerMatch.id);
    if (!client || client.practiceId !== session.practiceId) {
      const { notFound } = await import("next/navigation");
      notFound();
      throw new Error("Client not found");
    }

    const slug = clientSlugFor(client, peers);
    return { client, slug, clientId: client.id };
  },
);

/** Resolve client from URL segment; redirect UUID/old slugs to canonical name slug. */
export async function loadClientPage(
  ref: string,
  subpath = "",
): Promise<ResolvedClientPage> {
  const resolved = await resolveClientFromRef(ref);
  if (ref !== resolved.slug) {
    const h = await headers();
    const pathname = h.get("x-pathname");
    if (pathname?.includes(`/clients/${ref}`)) {
      permanentRedirect(
        pathname.replace(`/clients/${ref}`, `/clients/${resolved.slug}`),
      );
    }
    permanentRedirect(
      `/clients/${resolved.slug}${subpath.startsWith("/") ? subpath : subpath ? `/${subpath}` : ""}`,
    );
  }
  return resolved;
}

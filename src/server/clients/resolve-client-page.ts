import { permanentRedirect } from "next/navigation";
import { headers } from "next/headers";
import { cache } from "react";
import {
  listClients,
  type ClientRecord,
} from "@/server/actions/clients";
import { clientSlugFor } from "@/lib/client-slug";
import { requireSession } from "@/server/auth/session";

export type ResolvedClientPage = {
  client: ClientRecord;
  slug: string;
  clientId: string;
};

const listClientsCached = cache(async () => listClients());

export const resolveClientFromRef = cache(
  async (ref: string): Promise<ResolvedClientPage> => {
    const session = await requireSession();
    const clients = await listClientsCached();
    const inPractice = clients.filter((c) => c.practiceId === session.practiceId);

    const found =
      inPractice.find((c) => c.id === ref) ??
      inPractice.find((c) => clientSlugFor(c, inPractice) === ref);
    if (!found) {
      const { notFound } = await import("next/navigation");
      notFound();
      throw new Error("Client not found");
    }

    const slug = clientSlugFor(found, inPractice);
    return { client: found as ClientRecord, slug, clientId: found.id };
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

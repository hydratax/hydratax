const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClientUuid(ref: string): boolean {
  return UUID_RE.test(ref);
}

/** URL-safe slug from a client display name. */
export function slugifyClientName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

type NamedClient = { id: string; name: string };

/**
 * Stable slug for links. Appends a short id suffix when names collide within a practice.
 */
export function clientSlugFor(
  client: NamedClient,
  peers: NamedClient[],
): string {
  const base = slugifyClientName(client.name) || "client";
  const clashes = peers.filter(
    (c) => slugifyClientName(c.name) === base,
  ).length;
  if (clashes <= 1) return base;
  return `${base}-${client.id.slice(0, 8)}`;
}

export function clientPath(
  client: NamedClient,
  peers: NamedClient[],
  subpath = "",
): string {
  const slug = clientSlugFor(client, peers);
  const suffix = subpath.startsWith("/") ? subpath : subpath ? `/${subpath}` : "";
  return `/clients/${slug}${suffix}`;
}

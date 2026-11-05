import { slugifyClientName } from "@/lib/client-slug";

/** Local-part prefix so bookkeeping can recognise HydraTax document inboxes. */
export const DOCUMENT_INBOX_PREFIX = "hydratax.uk.";

/**
 * Compact mailbox key from a client name.
 * "Hydra Retail Ltd" → "hydratax.uk.hydraretail"
 */
export function documentInboxKeyFromName(name: string): string {
  const stripped = name
    .toLowerCase()
    .replace(/\b(limited|ltd\.?|llp|plc|inc\.?|corp\.?|company)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  const compact = stripped || slugifyClientName(name).replace(/-/g, "") || "client";
  return `${DOCUMENT_INBOX_PREFIX}${compact}`;
}

export function documentInboundDomain(): string {
  return (
    process.env.DOCUMENT_INBOUND_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_DOCUMENT_INBOUND_DOMAIN?.trim() ||
    "docs.hydratax.uk"
  );
}

/** Full address bookkeepers email documents to. */
export function documentInboxEmail(inboxKey: string): string {
  const key = inboxKey.trim().toLowerCase();
  return `${key}@${documentInboundDomain()}`;
}

/**
 * Pull a document-inbox key from To / CC / received_for addresses.
 * Accepts `hydratax.uk.hydraretail@docs.hydratax.uk` or bare local part.
 */
export function parseDocumentInboxKeyFromAddresses(
  addresses: Array<string | null | undefined>,
): string | null {
  for (const raw of addresses) {
    if (!raw) continue;
    const parts = raw
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const angle = part.match(/<([^>]+)>/);
      const email = (angle?.[1] ?? part).trim().toLowerCase();
      const local = email.includes("@") ? email.split("@")[0]! : email;
      if (local.startsWith(DOCUMENT_INBOX_PREFIX) && local.length > DOCUMENT_INBOX_PREFIX.length) {
        return local;
      }
    }
  }
  return null;
}

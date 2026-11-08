import { slugifyClientName } from "@/lib/client-slug";

/** Local-part prefix for practice Tasks inboxes (Documents + Queries). */
export const TASK_INBOX_PREFIX = "hydratax.tasks.";

/**
 * Compact mailbox key from a practice name + short id salt.
 * "Acme Accountants" + "a1b2c3d4" → "hydratax.tasks.acmeaccountants-a1b2c3d4"
 */
export function taskInboxKeyFromPractice(name: string, practiceId: string): string {
  const stripped = name
    .toLowerCase()
    .replace(/\b(limited|ltd\.?|llp|plc|accountants?|practice)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 28);
  const compact =
    stripped || slugifyClientName(name).replace(/-/g, "") || "practice";
  const salt = practiceId.replace(/-/g, "").slice(0, 8).toLowerCase();
  return `${TASK_INBOX_PREFIX}${compact}-${salt}`;
}

export function taskInboundDomain(): string {
  return (
    process.env.TASK_INBOUND_DOMAIN?.trim() ||
    process.env.DOCUMENT_INBOUND_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_DOCUMENT_INBOUND_DOMAIN?.trim() ||
    "docs.hydratax.uk"
  );
}

/** Full address clients / bookkeepers forward mail to. */
export function taskInboxEmail(inboxKey: string): string {
  const key = inboxKey.trim().toLowerCase();
  return `${key}@${taskInboundDomain()}`;
}

/**
 * Pull a tasks-inbox key from To / CC / received_for addresses.
 */
export function parseTaskInboxKeyFromAddresses(
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
      if (local.startsWith(TASK_INBOX_PREFIX) && local.length > TASK_INBOX_PREFIX.length) {
        return local;
      }
    }
  }
  return null;
}

/** Parse `Name <addr@x>` or bare `addr@x`. */
export function parseEmailFromHeader(from: string): {
  name: string | null;
  address: string;
} {
  const trimmed = from.trim();
  const m = /^(.+?)\s*<([^<>\s]+)>$/.exec(trimmed);
  if (m) {
    return {
      name: m[1]!.replace(/^["']|["']$/g, "").trim() || null,
      address: m[2]!.trim().toLowerCase(),
    };
  }
  return { name: null, address: trimmed.toLowerCase() };
}

/** RFC-ish From display: `"Practice Name" <verified@domain>`. */
export function formatFromHeader(displayName: string, address: string): string {
  const safeName = displayName
    .replace(/[\r\n"<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 78);
  const safeAddr = address.trim().toLowerCase();
  if (!safeName) return safeAddr;
  return `"${safeName}" <${safeAddr}>`;
}

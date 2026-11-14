/** Escape text for safe interpolation into HTML element content or attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Allow only http(s)/mailto URLs in href/src attributes (blocks javascript:,
 * data:, vbscript:). Returns "#" when the URL is not acceptable.
 */
export function safeUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "#";
  try {
    const u = new URL(raw);
    if (u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:") {
      return raw;
    }
  } catch {
    /* relative URLs fall through */
  }
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "#";
}

/**
 * Serialise structured data for a `<script type="application/ld+json">` tag.
 * `JSON.stringify` alone does NOT make the output safe inside HTML: a string
 * containing `</script>` terminates the element and the rest is parsed as
 * markup (stored XSS when it holds Companies House / user text). We escape
 * `<`, `>`, `&` and the JS line separators so the payload cannot break out.
 */
export function safeJsonLd(data: unknown): string {
  const json = JSON.stringify(data) ?? "null";
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function extractXmlTag(tag: string, xml: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1] : null;
}

export function penceToPoundsDisplay(pence: number): string {
  return (pence / 100).toFixed(2);
}

/** Prefer ChRIS / Body ErrorResponse text over the generic GovTalk 3001 wrapper. */
export function extractGovTalkErrorMessage(receipt: string): string | null {
  const errors: Array<{ number: string | null; text: string; location: string | null }> =
    [];
  const blockRe = /<Error\b[^>]*>([\s\S]*?)<\/Error>/gi;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(receipt)) !== null) {
    const inner = block[1];
    const text = extractXmlTag("Text", inner)?.trim();
    if (!text) continue;
    errors.push({
      number: extractXmlTag("Number", inner),
      text,
      location: extractXmlTag("Location", inner),
    });
  }
  if (!errors.length) {
    return extractXmlTag("Text", receipt) || extractXmlTag("Error", receipt) || null;
  }
  const generic = /departmental specific business logic/i;
  const specific = errors.filter((e) => !generic.test(e.text));
  const chosen = (specific.length ? specific : errors).map((e) => {
    const loc = e.location ? ` @ ${e.location}` : "";
    const num = e.number ? ` (${e.number})` : "";
    return `${e.text}${loc}${num}`;
  });
  return [...new Set(chosen)].join(" · ");
}

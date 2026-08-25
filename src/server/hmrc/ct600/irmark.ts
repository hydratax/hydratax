import { createHash } from "crypto";

/**
 * HMRC IRmark (generic) — SHA-1 over the canonical Body payload with IRmark removed.
 * We emit deterministic single-line XML so canonicalisation matches our generator.
 * Always validate the full package on TPVS/LTS before live filing.
 */
export function computeIrmark(bodyInnerXml: string): string {
  const withoutMark = bodyInnerXml.replace(
    /<IRmark\b[^>]*>[\s\S]*?<\/IRmark>/gi,
    "",
  );
  const normalised = withoutMark
    .replace(/\r\n/g, "\n")
    .replace(/>\s+</g, "><")
    .trim();
  return createHash("sha1").update(normalised, "utf8").digest("base64");
}

export function injectIrmark(bodyInnerXml: string, mark: string): string {
  const markXml = `<IRmark Type="generic">${mark}</IRmark>`;
  if (/<IRmark\b/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(/<IRmark\b[^>]*>[\s\S]*?<\/IRmark>/i, markXml);
  }
  if (/<\/DefaultCurrency>/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(/<\/DefaultCurrency>/i, `</DefaultCurrency>${markXml}`);
  }
  if (/<\/IRheader>/i.test(bodyInnerXml)) {
    return bodyInnerXml.replace(/<\/IRheader>/i, `${markXml}</IRheader>`);
  }
  // Last resort: place immediately inside the IR envelope.
  return bodyInnerXml.replace(/(<IRenvelope\b[^>]*>)/i, `$1${markXml}`);
}

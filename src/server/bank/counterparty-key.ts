/**
 * Stable counterparty key from a UK bank narrative — used to cluster unknowns
 * into provisional review heads without an LLM.
 */

const PREFIX_NOISE =
  /^(card\s*payment|contactless|faster\s*payments?|fp\s*(in|out)?|dd|direct\s*debit|standing\s*order|bacs|chaps|pos|visa|mastercard|debit\s*card|credit\s*card|online|mobile|atm|cash|purchase|payment\s*to|payment\s*from|transfer\s*to|transfer\s*from|bill\s*payment)\b/gi;

const TRAILING_NOISE =
  /\b(ref|reference|auth|arn|rrn|mid|tid|card)\s*[:#]?\s*[a-z0-9\-]+$/gi;

export function counterpartyKey(description: string): string {
  let s = description.toLowerCase().replace(/\u00a0/g, " ");
  s = s.replace(/\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?/g, " ");
  s = s.replace(/£?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})/g, " ");
  s = s.replace(/\b\d{6,}\b/g, " ");
  s = s.replace(PREFIX_NOISE, " ");
  s = s.replace(TRAILING_NOISE, " ");
  s = s.replace(/[^a-z0-9&\s]/g, " ").replace(/\s+/g, " ").trim();

  // Drop trailing pure-numeric tokens (card auth crumbs / line noise).
  let tokens = s.split(" ").filter((t) => t.length > 1);
  while (tokens.length && /^\d+$/.test(tokens[tokens.length - 1]!)) {
    tokens = tokens.slice(0, -1);
  }
  const key = tokens.slice(0, 5).join(" ").slice(0, 48).trim();
  return key || "unknown payee";
}

export function titleCaseKey(key: string): string {
  return key
    .split(" ")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}

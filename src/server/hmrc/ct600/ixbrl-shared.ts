/** Shared inline XBRL namespace declarations for HMRC CT attachments. */
export const IXBRL_HTML_NAMESPACES = [
  'xmlns="http://www.w3.org/1999/xhtml"',
  'xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"',
  'xmlns:xbrldi="http://xbrl.org/2006/xbrldi"',
  'xmlns:link="http://www.xbrl.org/2003/linkbase"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:xbrli="http://www.xbrl.org/2003/instance"',
  'xmlns:iso4217="http://www.xbrl.org/2003/iso4217"',
  'xmlns:ixt2="http://www.xbrl.org/inlineXBRL/transformation/2011-07-31"',
].join("\n  ");

export function ixHtmlOpen(extraNamespaces: string): string {
  return `<html\n  ${IXBRL_HTML_NAMESPACES}\n  ${extraNamespaces}>`;
}

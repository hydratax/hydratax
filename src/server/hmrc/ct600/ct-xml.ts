/** CT/5 GovTalk payload namespace — use `ct:` prefix on GovTalkMessage (HMRC IRmark). */
export const CT_NS = "http://www.govtalk.gov.uk/taxation/CT/5";
export const CT_PREFIX = "ct";

export function ctTag(localName: string): string {
  return `${CT_PREFIX}:${localName}`;
}

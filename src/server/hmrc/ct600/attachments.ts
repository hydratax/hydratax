import type { Ct600Attachment, Ct600Figures } from "@/server/hmrc/ct600/types";
import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";
import { buildAccountsIxbrl } from "@/server/hmrc/ct600/ixbrl-accounts";
import { buildComputationIxbrl } from "@/server/hmrc/ct600/ixbrl-computation";
import { ctTag } from "@/server/hmrc/ct600/ct-xml";
import { escapeXml } from "@/server/hmrc/ct600/xml-utils";

/** HMRC style guide: strip BOM and XML declaration before base64 embed. */
export function prepareIxbrlForEmbed(html: string): string {
  return html.replace(/^\uFEFF/, "").replace(/^<\?xml[^?]*\?>\s*/i, "");
}

function toAttachment(
  kind: Ct600Attachment["kind"],
  filename: string,
  html: string,
): Ct600Attachment {
  const prepared = prepareIxbrlForEmbed(html);
  const bytes = Buffer.from(prepared, "utf8");
  return {
    kind,
    filename,
    mediaType: "application/xhtml+xml",
    contentBase64: bytes.toString("base64"),
    byteLength: bytes.length,
  };
}

export function buildCt600Attachments(opts: {
  companyName: string;
  companyNumber: string;
  utr: string;
  figures: Ct600Figures;
  accountsDraft?: YearEndAccountsDraft | null;
  taxableProfitPence: number;
  taxChargePence: number;
  declarantName?: string | null;
  declarantStatus?: string | null;
}): Ct600Attachment[] {
  const accountsHtml = buildAccountsIxbrl({
    companyName: opts.companyName,
    companyNumber: opts.companyNumber,
    utr: opts.utr,
    figures: opts.figures,
    draft: opts.accountsDraft,
    declarantName: opts.declarantName,
    declarantStatus: opts.declarantStatus,
  });
  const computationHtml = buildComputationIxbrl({
    companyName: opts.companyName,
    companyNumber: opts.companyNumber,
    utr: opts.utr,
    figures: opts.figures,
    taxableProfitPence: opts.taxableProfitPence,
    taxChargePence: opts.taxChargePence,
  });
  return [
    toAttachment("computations", "computations.html", computationHtml),
    toAttachment("accounts", "accounts.html", accountsHtml),
  ];
}

function encodedInstance(doc: Ct600Attachment, entryPoint = false): string {
  const attrs = [
    `Filename="${escapeXml(doc.filename)}"`,
    entryPoint ? 'entryPoint="yes"' : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<${ctTag("Instance")}><${ctTag("EncodedInlineXBRLDocument")} ${attrs}>${doc.contentBase64}</${ctTag("EncodedInlineXBRLDocument")}></${ctTag("Instance")}>`;
}

/** CT/5 AttachedFiles wrapper (XBRLsubmission + base64 iXBRL instances). */
export function attachmentsXml(attachments: Ct600Attachment[]): string {
  if (!attachments.length) return "";

  const computations = attachments.filter((a) => a.kind === "computations");
  const accounts = attachments.filter((a) => a.kind === "accounts");

  let xbrl = "";
  for (const doc of computations) {
    xbrl += `<${ctTag("Computation")}>${encodedInstance(doc)}</${ctTag("Computation")}>`;
  }
  for (const doc of accounts) {
    xbrl += `<${ctTag("Accounts")}>${encodedInstance(doc, true)}</${ctTag("Accounts")}>`;
  }

  return `<${ctTag("AttachedFiles")}><${ctTag("XBRLsubmission")}>${xbrl}</${ctTag("XBRLsubmission")}></${ctTag("AttachedFiles")}>`;
}

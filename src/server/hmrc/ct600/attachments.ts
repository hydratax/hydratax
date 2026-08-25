import type { Ct600Attachment, Ct600Figures } from "@/server/hmrc/ct600/types";
import type { YearEndAccountsDraft } from "@/server/accounts/year-end-from-bank";
import { buildAccountsIxbrl } from "@/server/hmrc/ct600/ixbrl-accounts";
import { buildComputationIxbrl } from "@/server/hmrc/ct600/ixbrl-computation";
import { escapeXml } from "@/server/hmrc/ct600/xml-utils";

function toAttachment(
  kind: Ct600Attachment["kind"],
  filename: string,
  html: string,
): Ct600Attachment {
  const bytes = Buffer.from(html, "utf8");
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
}): Ct600Attachment[] {
  const accountsHtml = buildAccountsIxbrl({
    companyName: opts.companyName,
    companyNumber: opts.companyNumber,
    utr: opts.utr,
    figures: opts.figures,
    draft: opts.accountsDraft,
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
    toAttachment("accounts", "accounts.xhtml", accountsHtml),
    toAttachment("computations", "computations.xhtml", computationHtml),
  ];
}

export function attachmentsXml(attachments: Ct600Attachment[]): string {
  if (!attachments.length) return "";
  const items = attachments
    .map(
      (a) => `<Attachment>
      <DocumentType>${a.kind === "accounts" ? "Accounts" : "Computations"}</DocumentType>
      <Filename>${escapeXml(a.filename)}</Filename>
      <MediaType>${escapeXml(a.mediaType)}</MediaType>
      <ContentEncoding>base64</ContentEncoding>
      <Content>${a.contentBase64}</Content>
    </Attachment>`,
    )
    .join("");
  return `<AttachedFiles>${items}</AttachedFiles>`;
}

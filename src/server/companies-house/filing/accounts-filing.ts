import { buildAccountsIxbrl } from "@/server/hmrc/ct600/ixbrl-accounts";
import type { Ct600Figures } from "@/server/hmrc/ct600/types";
import { pence } from "@/server/money/pence";
import {
  buildAccountsSubmissionXml,
  submitChFormXml,
} from "./company-forms-xml";
import { isChXmlGatewayConfigured } from "./config";

export type AccountsSubmitResult = {
  ok: boolean;
  submissionNumber?: string | null;
  error?: string;
  mode?: "xml_gateway" | "dry_run";
};

function dormantFigures(
  periodStart: string,
  periodEnd: string,
  shareCapitalPence = 100,
): Ct600Figures {
  return {
    clientId: "00000000-0000-0000-0000-000000000001",
    periodStart,
    periodEnd,
    turnoverPence: pence(0),
    otherIncomePence: pence(0),
    costOfSalesPence: pence(0),
    administrativeExpensesPence: pence(0),
    tangibleAssetsPence: pence(0),
    cashAtBankPence: pence(0),
    debtorsPence: pence(0),
    creditorsPence: pence(0),
    calledUpShareCapitalPence: pence(shareCapitalPence),
    profitAndLossAccountPence: pence(0),
  };
}

export async function submitAccountsFromPayload(opts: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  periodStart: string;
  periodEnd: string;
  accountsType: string;
}): Promise<AccountsSubmitResult> {
  if (!isChXmlGatewayConfigured()) {
    return {
      ok: false,
      mode: "dry_run",
      error:
        "Companies House presenter credentials are not configured on this environment — live submit is disabled.",
    };
  }

  const figures = dormantFigures(opts.periodStart, opts.periodEnd);

  const ixbrl = buildAccountsIxbrl({
    companyName: opts.companyName,
    companyNumber: opts.companyNumber.replace(/\D/g, ""),
    utr: "0000000000",
    figures,
    declarantName: "Director",
    declarantStatus: "Director",
  });

  const xml = buildAccountsSubmissionXml({
    companyNumber: opts.companyNumber,
    companyName: opts.companyName,
    companyAuthCode: opts.companyAuthCode,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    ixbrlHtml: ixbrl,
  });

  const result = await submitChFormXml(xml);
  if (!result.ok) {
    return { ok: false, mode: "xml_gateway", error: result.error };
  }

  return {
    ok: true,
    mode: "xml_gateway",
    submissionNumber: result.submissionNumber ?? null,
  };
}

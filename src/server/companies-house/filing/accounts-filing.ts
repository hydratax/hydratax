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

function poundsToPence(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(raw * 100);
  }
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw.replace(/,/g, "").replace(/[()]/g, "").trim());
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return 0;
}

function p(raw: unknown) {
  return pence(poundsToPence(raw) / 100);
}

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

/** Build CT figures from year-end form session payload when present. */
export function figuresFromYearEndPayload(
  raw: unknown,
  periodStart: string,
  periodEnd: string,
): Ct600Figures | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as {
    pl?: Record<string, string>;
    bs?: Record<string, string>;
    periodStart?: string;
    periodEnd?: string;
  };
  if (!data.pl && !data.bs) return null;

  const pl = data.pl ?? {};
  const bs = data.bs ?? {};
  const fixed = poundsToPence(bs.fixedAssets);
  const currentAssets = poundsToPence(bs.totalCurrentAssets);
  // Approximate current assets split for iXBRL (cash vs debtors).
  const cash = Math.max(0, Math.round(currentAssets * 0.5));
  const debtors = Math.max(0, currentAssets - cash);
  const share = poundsToPence(bs.shareCapital);

  return {
    clientId: "00000000-0000-0000-0000-000000000001",
    periodStart: data.periodStart || periodStart,
    periodEnd: data.periodEnd || periodEnd,
    turnoverPence: p(pl.turnover),
    otherIncomePence: p(pl.interestIncome),
    costOfSalesPence: p(pl.costOfMaterials),
    administrativeExpensesPence: pence(
      (poundsToPence(pl.staffCosts) +
        poundsToPence(pl.depreciation) +
        poundsToPence(pl.otherCharges)) /
        100,
    ),
    tangibleAssetsPence: pence(fixed / 100),
    cashAtBankPence: pence(cash / 100),
    debtorsPence: pence(debtors / 100),
    creditorsPence: pence(
      (poundsToPence(bs.creditorsWithinOneYear) +
        poundsToPence(bs.corporationTaxPayable) +
        poundsToPence(bs.creditorsAfterOneYear)) /
        100,
    ),
    calledUpShareCapitalPence: share > 0 ? pence(share / 100) : pence(1),
    profitAndLossAccountPence: p(bs.retainedEarnings),
  };
}

function parseYearEndFiguresField(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function submitAccountsFromPayload(opts: {
  companyNumber: string;
  companyName: string;
  companyAuthCode: string;
  periodStart: string;
  periodEnd: string;
  accountsType: string;
  yearEndFigures?: unknown;
  declarantName?: string | null;
}): Promise<AccountsSubmitResult> {
  if (!isChXmlGatewayConfigured()) {
    return {
      ok: false,
      mode: "dry_run",
      error:
        "Companies House presenter credentials are not configured on this environment — live submit is disabled.",
    };
  }

  const fromWizard = figuresFromYearEndPayload(
    parseYearEndFiguresField(opts.yearEndFigures) ?? opts.yearEndFigures,
    opts.periodStart,
    opts.periodEnd,
  );
  const figures =
    fromWizard ??
    (opts.accountsType === "dormant"
      ? dormantFigures(opts.periodStart, opts.periodEnd)
      : dormantFigures(opts.periodStart, opts.periodEnd));

  const ixbrl = buildAccountsIxbrl({
    companyName: opts.companyName,
    companyNumber: opts.companyNumber.replace(/\D/g, ""),
    utr: "0000000000",
    figures,
    declarantName: opts.declarantName || "Director",
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

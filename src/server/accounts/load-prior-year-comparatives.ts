import {
  EMPTY_COMPARATIVES,
  parseComparatives,
  type PriorYearComparatives,
} from "@/lib/accounting-periods";
import {
  comparativesFromCt600Figures,
  comparativesHaveFigures,
  extractComparativesFromFiledAccountsHtml,
} from "@/server/accounts/extract-filed-comparatives";
import { listCt600Returns } from "@/server/actions/ct600";
import {
  downloadFilingDocumentPreferringIxbrl,
  getAccountsFilingForComparatives,
  isCompaniesHouseApiConfigured,
} from "@/server/companies-house/api";

function priorPeriodEnd(periodEnd: string | null | undefined) {
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return null;
  const d = new Date(`${periodEnd}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Best available prior-year figures for the year-end comparative column:
 * 1) Saved accounts comparatives on the client
 * 2) Prior-period CT600 draft / return for this client
 * 3) Companies House accounts iXBRL for the prior made-up-to date
 */
export async function loadPriorYearComparatives(opts: {
  clientId: string;
  companyNumber: string | null;
  /** Current year-end being prepared (e.g. 2026-02-28) */
  periodEnd?: string | null;
  savedComparatives?: unknown;
}): Promise<{
  comparatives: PriorYearComparatives;
  source: "saved" | "ct600" | "companies_house" | "none";
  madeUpTo: string | null;
}> {
  const saved = parseComparatives(opts.savedComparatives ?? null);
  if (comparativesHaveFigures(saved)) {
    return { comparatives: saved, source: "saved", madeUpTo: null };
  }

  const targetEnd = priorPeriodEnd(opts.periodEnd);

  try {
    const returns = await listCt600Returns(opts.clientId);
    const prior = returns.find((r) => {
      if (targetEnd && r.periodEnd === targetEnd) return true;
      if (!targetEnd || !opts.periodEnd) return false;
      return (
        typeof r.periodEnd === "string" &&
        r.periodEnd < opts.periodEnd! &&
        Boolean(r.figures)
      );
    });
    if (prior?.figures && typeof prior.figures === "object") {
      const fromCt = comparativesFromCt600Figures(
        prior.figures as Record<string, unknown>,
      );
      if (comparativesHaveFigures(fromCt)) {
        return {
          comparatives: fromCt,
          source: "ct600",
          madeUpTo: prior.periodEnd,
        };
      }
    }
  } catch {
    /* ignore — fall through to CH */
  }

  if (opts.companyNumber && isCompaniesHouseApiConfigured()) {
    try {
      const filing = await getAccountsFilingForComparatives(
        opts.companyNumber,
        {
          targetMadeUpTo: targetEnd,
          currentPeriodEnd: opts.periodEnd,
        },
      );
      if (filing?.documentMetadataUrl) {
        const doc = await downloadFilingDocumentPreferringIxbrl(
          filing.documentMetadataUrl,
        );
        const text = new TextDecoder("utf-8").decode(doc.bytes);
        if (
          /ix:nonFraction/i.test(text) ||
          /application\/xhtml\+xml|html/i.test(doc.contentType)
        ) {
          // If the filing itself is for the current period, use its prior column.
          const preferPriorColumn = Boolean(
            opts.periodEnd &&
              filing.madeUpTo &&
              filing.madeUpTo >= opts.periodEnd,
          );
          const fromCh = extractComparativesFromFiledAccountsHtml(text, {
            preferPriorColumn,
          });
          if (comparativesHaveFigures(fromCh)) {
            return {
              comparatives: fromCh,
              source: "companies_house",
              madeUpTo: preferPriorColumn
                ? targetEnd ?? filing.madeUpTo
                : filing.madeUpTo,
            };
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    comparatives: { ...EMPTY_COMPARATIVES },
    source: "none",
    madeUpTo: null,
  };
}

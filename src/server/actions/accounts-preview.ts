"use server";

import { z } from "zod";
import { buildChMicroAccountsIxbrl } from "@/server/companies-house/filing/ch-micro-ixbrl";
import { resolveAccountsSigningDirector } from "@/server/companies-house/filing/accounts-preflight";
import { getCompanyOfficers } from "@/server/companies-house/api";
import { getOptionalSession } from "@/server/auth/session";

const previewSchema = z.object({
  companyName: z.string().min(1),
  companyNumber: z.string().min(6).max(8),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dormant: z.boolean(),
  directorName: z.string().min(1),
  approvalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  averageEmployees: z.number().int().min(0).max(9999),
  fixedAssetsPence: z.number().int(),
  currentAssetsPence: z.number().int(),
  creditorsWithinPence: z.number().int(),
  creditorsAfterPence: z.number().int().default(0),
  shareCapitalPence: z.number().int(),
  retainedEarningsPence: z.number().int(),
  calledUpShareCapitalNotPaidPence: z.number().int().nullable().optional(),
  priorFixedAssetsPence: z.number().int().nullable().optional(),
  priorCurrentAssetsPence: z.number().int().nullable().optional(),
  priorCreditorsWithinPence: z.number().int().nullable().optional(),
  priorCreditorsAfterPence: z.number().int().nullable().optional(),
  priorShareCapitalPence: z.number().int().nullable().optional(),
  priorRetainedEarningsPence: z.number().int().nullable().optional(),
  priorCalledUpShareCapitalNotPaidPence: z
    .number()
    .int()
    .nullable()
    .optional(),
  priorPeriodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priorAverageEmployees: z.number().int().min(0).max(9999).nullable().optional(),
  /** When true, signing director must match an active CH officer */
  enforceDirectorMatch: z.boolean().optional(),
});

/**
 * Build the exact Companies House micro/dormant iXBRL HTML that will be filed,
 * for on-screen preview before submission. Does not submit anything.
 * Session optional — director register match runs when signed in or when CH API allows.
 */
export async function previewChAccountsHtml(input: z.input<typeof previewSchema>) {
  const data = previewSchema.parse(input);
  const companyNumber = data.companyNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  let directorName = data.directorName.trim();
  const session = await getOptionalSession().catch(() => null);
  if (data.enforceDirectorMatch !== false) {
    try {
      const officers = await getCompanyOfficers(companyNumber);
      const resolved = resolveAccountsSigningDirector({
        companyNumber,
        claimedName: directorName,
        officers,
      });
      if (!resolved.ok) {
        return { ok: false as const, error: resolved.error };
      }
      directorName = resolved.directorName;
    } catch (err) {
      // Without a session or CH API, still show the HTML draft so the user can check layout.
      if (session) {
        return {
          ok: false as const,
          error:
            err instanceof Error
              ? err.message
              : "Could not verify the signing director against Companies House.",
        };
      }
    }
  }

  const hasPrior =
    data.priorFixedAssetsPence != null ||
    data.priorCurrentAssetsPence != null ||
    data.priorCreditorsWithinPence != null ||
    data.priorShareCapitalPence != null ||
    data.priorRetainedEarningsPence != null;

  const html = buildChMicroAccountsIxbrl({
    companyName: data.companyName.trim(),
    companyNumber,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    dormant: data.dormant,
    balanceSheet: {
      fixedAssetsPence: data.fixedAssetsPence,
      currentAssetsPence: data.currentAssetsPence,
      creditorsWithinPence: data.creditorsWithinPence,
      creditorsAfterPence: data.creditorsAfterPence,
      shareCapitalPence: data.shareCapitalPence,
      retainedEarningsPence: data.retainedEarningsPence,
      calledUpShareCapitalNotPaidPence:
        data.calledUpShareCapitalNotPaidPence ?? null,
    },
    priorBalanceSheet: hasPrior
      ? {
          fixedAssetsPence: data.priorFixedAssetsPence ?? 0,
          currentAssetsPence: data.priorCurrentAssetsPence ?? 0,
          creditorsWithinPence: data.priorCreditorsWithinPence ?? 0,
          creditorsAfterPence: data.priorCreditorsAfterPence ?? 0,
          shareCapitalPence: data.priorShareCapitalPence ?? 100,
          retainedEarningsPence: data.priorRetainedEarningsPence ?? 0,
          calledUpShareCapitalNotPaidPence:
            data.priorCalledUpShareCapitalNotPaidPence ?? null,
        }
      : null,
    priorPeriodEnd: data.priorPeriodEnd ?? null,
    priorAverageEmployees: data.priorAverageEmployees ?? null,
    directorName,
    averageEmployees: data.dormant ? 0 : data.averageEmployees,
    approvalDate: data.approvalDate,
  });

  return {
    ok: true as const,
    html,
    directorName,
    dormant: data.dormant,
    filename: `${companyNumber}_CH_accounts_preview_${data.periodEnd}.xhtml`,
  };
}

import {
  validateCt600Questionnaire,
  type Ct600QuestionnaireAnswers,
} from "@/lib/hmrc/filing-guides";
import { ct600FiguresSchema } from "@/server/money/schemas";
import type {
  Ct600PackageInput,
  Ct600PackageValidation,
  Ct600ValidationIssue,
} from "@/server/hmrc/ct600/types";
import { getHmrcConfig } from "@/server/hmrc/config";

const UNSUPPORTED_SUPPLEMENTARY = new Set(["CT600A", "CT600C", "CT600L"]);

function issue(
  code: string,
  message: string,
  blocking = true,
): Ct600ValidationIssue {
  return { code, message, blocking };
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return -1;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

export function validateCt600Package(
  input: Ct600PackageInput,
  opts?: { strict?: boolean },
): Ct600PackageValidation {
  const strict = opts?.strict !== false;
  const issues: Ct600ValidationIssue[] = [];
  const questionnaire = validateCt600Questionnaire(input.questionnaire ?? {});

  if (strict && !questionnaire.ok) {
    issues.push(
      issue(
        "questionnaire_incomplete",
        `Complete the HMRC checklist before submit (${questionnaire.missing.join(", ")}).`,
      ),
    );
  }

  if (strict && input.questionnaire.accounts_attached !== true) {
    issues.push(
      issue(
        "accounts_required",
        "Statutory accounts (iXBRL) must be attached — confirm box 80 on the checklist.",
      ),
    );
  }
  if (strict && input.questionnaire.computations_attached !== true) {
    issues.push(
      issue(
        "computations_required",
        "Corporation tax computations (iXBRL) must be attached — confirm box 85/90 on the checklist.",
      ),
    );
  }
  if (strict && input.questionnaire.declaration !== true) {
    issues.push(
      issue(
        "declaration_required",
        "The declaration must be confirmed before submit.",
      ),
    );
  }

  for (const page of questionnaire.supplementaryPages) {
    if (strict && UNSUPPORTED_SUPPLEMENTARY.has(page)) {
      issues.push(
        issue(
          `supplementary_${page.toLowerCase()}`,
          `${page} is required for this return but is not yet supported in HydraTax. File via an agent tool or contact support.`,
        ),
      );
    }
  }

  const utr = String(input.utr ?? "").replace(/\s+/g, "");
  if (!/^\d{10}$/.test(utr)) {
    issues.push(issue("utr_invalid", "A valid 10-digit company UTR is required."));
  }
  if (!input.companyNumber?.trim()) {
    issues.push(issue("company_number", "Company number is required."));
  }
  if (!input.companyName?.trim()) {
    issues.push(issue("company_name", "Company name is required."));
  }

  const figuresParsed = ct600FiguresSchema.safeParse(input.figures);
  if (!figuresParsed.success) {
    issues.push(
      issue("figures_invalid", figuresParsed.error.issues[0]?.message ?? "Invalid CT figures."),
    );
  } else {
    const { periodStart, periodEnd } = figuresParsed.data;
    const span = daysBetween(periodStart, periodEnd);
    if (span < 0) {
      issues.push(issue("period_invalid", "Accounting period dates are invalid."));
    } else if (span > 366) {
      issues.push(
        issue(
          "period_long",
          "Accounting period exceeds 12 months — split into two CT600 returns before submit.",
        ),
      );
    }
  }

  const cfg = getHmrcConfig();
  if (strict && !cfg.ctVendorId) {
    issues.push(
      issue(
        "vendor_id_missing",
        "HMRC_CT_VENDOR_ID is not configured — add your SDST Vendor ID to production environment variables.",
      ),
    );
  }

  const senderId =
    input.senderId?.trim() ||
    (cfg.env === "production" ? "" : cfg.ctTestSenderId);
  const senderPassword =
    input.senderPassword?.trim() ||
    (cfg.env === "production" ? "" : cfg.ctTestPassword);
  if (strict) {
    if (cfg.env === "production") {
      if (!senderId || !senderPassword) {
        issues.push(
          issue(
            "live_credentials",
            "Live CT600 submit requires the client's Government Gateway Sender ID and password.",
          ),
        );
      }
    } else if (!senderId || !senderPassword) {
      issues.push(
        issue(
          "test_credentials",
          "ETS test credentials missing — set HMRC_CT_TEST_SENDER_ID and HMRC_CT_TEST_PASSWORD in .env.local.",
        ),
      );
    }
  }

  const blocking = issues.filter((i) => i.blocking);
  return {
    ok: blocking.length === 0,
    issues,
    questionnaire,
  };
}

export function assertCt600PackageValid(input: Ct600PackageInput): Ct600PackageValidation {
  const validation = validateCt600Package(input);
  if (!validation.ok) {
    const first = validation.issues.find((i) => i.blocking);
    throw new Error(first?.message ?? "CT600 package failed validation.");
  }
  return validation;
}

/**
 * Practice-facing payroll workflow status for employer cards / filters.
 * Desk language only — maps pay_run rows to Not started → Generated → Submitted.
 */

export type PayrollWorkflowStatus =
  | "not_started"
  | "generated"
  | "submitted";

export type PayrollClientFilter =
  | "all"
  | "not_started"
  | "generated"
  | "submitted"
  | "monthly"
  | "weekly";

export type PayrollRunHint = {
  payDate?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  status?: string | null;
  kind?: string | null;
  payFrequency?: string | null;
  hmrcCorrelationId?: string | null;
  submittedAt?: string | Date | null;
};

export type PayrollClientSummary = {
  status: PayrollWorkflowStatus;
  /** Dominant / latest run frequency */
  payFrequency: "M1" | "W1";
  latestPayDate: string | null;
  latestPeriodStart: string | null;
  latestPeriodEnd: string | null;
  periodLabel: string | null;
};

function isFps(run: PayrollRunHint): boolean {
  return String(run.kind ?? "FPS").toUpperCase() === "FPS";
}

/** Submitted / filed with HMRC (desk: RTI submitted). */
export function isPayrollRtiSubmitted(run: PayrollRunHint): boolean {
  const status = String(run.status ?? "").toLowerCase();
  if (status === "accepted" || status === "submitted") return true;
  // Demo seeds sometimes store ready + DEMO-SEED correlation — treat as filed.
  const corr = String(run.hmrcCorrelationId ?? "");
  if (corr.startsWith("DEMO-SEED-") && status !== "rejected" && status !== "error") {
    return true;
  }
  return false;
}

/** Payslips generated / pack ready — not yet filed (or rejected). */
export function isPayrollGenerated(run: PayrollRunHint): boolean {
  if (isPayrollRtiSubmitted(run)) return false;
  const status = String(run.status ?? "").toLowerCase();
  return (
    status === "ready" ||
    status === "draft" ||
    status === "finalised" ||
    status === "rejected"
  );
}

function formatPeriodLabel(payDate: string | null, frequency: "M1" | "W1") {
  if (!payDate || payDate.length < 7) return null;
  const d = new Date(`${payDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return payDate;
  if (frequency === "W1") {
    return `Week ending ${d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/**
 * Derive card status from FPS pay runs (newest first preferred).
 * Frequency falls back to employee majority when no runs exist.
 */
export function derivePayrollClientSummary(
  runs: PayrollRunHint[],
  employeeFrequencies: Array<"M1" | "W1" | string> = [],
): PayrollClientSummary {
  const fps = runs.filter(isFps);
  const latest = fps[0] ?? null;

  let payFrequency: "M1" | "W1" = "M1";
  if (latest?.payFrequency === "W1") {
    payFrequency = "W1";
  } else if (latest?.payFrequency === "M1") {
    payFrequency = "M1";
  } else {
    const weekly = employeeFrequencies.filter((f) => f === "W1").length;
    const monthly = employeeFrequencies.filter((f) => f !== "W1").length;
    payFrequency = weekly > monthly ? "W1" : "M1";
  }

  if (!latest) {
    return {
      status: "not_started",
      payFrequency,
      latestPayDate: null,
      latestPeriodStart: null,
      latestPeriodEnd: null,
      periodLabel: null,
    };
  }

  const latestPayDate = latest.payDate ? String(latest.payDate) : null;
  const status: PayrollWorkflowStatus = isPayrollRtiSubmitted(latest)
    ? "submitted"
    : isPayrollGenerated(latest)
      ? "generated"
      : "not_started";

  return {
    status,
    payFrequency,
    latestPayDate,
    latestPeriodStart: latest.periodStart ? String(latest.periodStart) : null,
    latestPeriodEnd: latest.periodEnd ? String(latest.periodEnd) : null,
    periodLabel: formatPeriodLabel(latestPayDate, payFrequency),
  };
}

export function matchesPayrollFilter(
  summary: PayrollClientSummary,
  filter: PayrollClientFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "not_started":
      return summary.status === "not_started";
    case "generated":
      return summary.status === "generated";
    case "submitted":
      return summary.status === "submitted";
    case "monthly":
      return summary.payFrequency === "M1";
    case "weekly":
      return summary.payFrequency === "W1";
    default:
      return true;
  }
}

export function payrollStatusLabel(status: PayrollWorkflowStatus): string {
  switch (status) {
    case "generated":
      return "Payroll generated";
    case "submitted":
      return "RTI submitted";
    default:
      return "Not started";
  }
}

export function payrollFrequencyLabel(freq: "M1" | "W1"): string {
  return freq === "W1" ? "Weekly" : "Monthly";
}

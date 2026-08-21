"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { prepareCt600, submitCt600 } from "@/server/actions/ct600";
import { money } from "@/lib/format";
import { authEntryHref } from "@/lib/auth-return";
import { CT600_PHASES } from "@/lib/hmrc/filing-guides";
import { AccountsPdfScrollViewer } from "@/components/forms/accounts-pdf-scroll-viewer";
import {
import { FormErrorBanner } from "@/components/forms/form-error-banner";
  TrialBalanceUpload,
  type Ct600TbFigures,
} from "@/components/forms/trial-balance-upload";

export type YearEndFilingMode = "ct600" | "accounts" | "both";

type CompanySummary = {
  name: string;
  companyNumber: string | null;
  registeredOffice: string | null;
  companyStatus: string | null;
  sicCodes: string[];
  directors: string[];
  incorporatedOn?: string | null;
  accountsNextDue?: string | null;
};

export type LastFiledAccounts = {
  description: string;
  filedOn: string | null;
  madeUpTo: string | null;
  pages: number | null;
  registerUrl: string;
  companyFilingHistoryUrl: string;
  /** Companies House Document API preview via our authenticated proxy */
  chPreviewUrl?: string | null;
  /** Local uploaded accounts PDF/image if available */
  localPreviewUrl?: string | null;
  localFilename?: string | null;
};

type Props = {
  /** Practice client — required for CT600 prepare/submit */
  clientId?: string | null;
  initialMode: YearEndFilingMode;
  company: CompanySummary;
  defaultPeriodEnd?: string | null;
  defaultPeriodStart?: string | null;
  accountsCheckoutHref: string;
  lastFiledAccounts?: LastFiledAccounts | null;
  /** Sign-in URL when CT600 is selected without a practice client */
  signInHref?: string;
  /** Path to return to after sign-in (preferred over parsing signInHref) */
  postSignInPath?: string;
  /** Persist Enter Details fields in localStorage under this key */
  persistKey?: string;
  /** Hide filing-mode cards (mode already chosen upstream) */
  lockFilingMode?: boolean;
  /** Notify parent when Enter Details / Review / Submit phase changes */
  onPhaseChange?: (phase: number) => void;
  /** Called instead of navigating to accounts checkout when accounts path is ready */
  onContinueToPayment?: (info: {
    periodStart: string;
    periodEnd: string;
    companyType: string;
  }) => void;
};

const COMPANY_TYPES = [
  {
    id: "trading",
    title: "Trading Company",
    blurb: "Active trade or business income",
  },
  {
    id: "dormant",
    title: "Dormant Company",
    blurb: "No significant accounting transactions",
  },
] as const;

const FILING_MODES = [
  {
    id: "ct600" as const,
    title: "CT600 only",
    blurb: "Corporation Tax return to HMRC",
  },
  {
    id: "accounts" as const,
    title: "Accounts only",
    blurb: "Annual accounts to Companies House",
  },
  {
    id: "both" as const,
    title: "CT600 and Accounts",
    blurb: "File tax return and accounts together",
  },
];

type PlKey =
  | "turnover"
  | "interestIncome"
  | "costOfMaterials"
  | "staffCosts"
  | "depreciation"
  | "otherCharges"
  | "corporationTax";

type BsKey =
  | "fixedAssets"
  | "totalCurrentAssets"
  | "creditorsWithinOneYear"
  | "corporationTaxPayable"
  | "creditorsAfterOneYear"
  | "shareCapital"
  | "retainedEarnings";

type YearPl = Record<PlKey, string>;
type YearBs = Record<BsKey, string>;

const BLANK_PL: YearPl = {
  turnover: "",
  interestIncome: "",
  costOfMaterials: "",
  staffCosts: "",
  depreciation: "",
  otherCharges: "",
  corporationTax: "",
};

const BLANK_BS: YearBs = {
  fixedAssets: "",
  totalCurrentAssets: "",
  creditorsWithinOneYear: "",
  corporationTaxPayable: "",
  creditorsAfterOneYear: "",
  shareCapital: "",
  retainedEarnings: "",
};

const ZERO_PL: YearPl = {
  turnover: "0",
  interestIncome: "0",
  costOfMaterials: "0",
  staffCosts: "0",
  depreciation: "0",
  otherCharges: "0",
  corporationTax: "0",
};

const ZERO_BS: YearBs = {
  fixedAssets: "0",
  totalCurrentAssets: "0",
  creditorsWithinOneYear: "0",
  corporationTaxPayable: "0",
  creditorsAfterOneYear: "0",
  shareCapital: "0",
  retainedEarnings: "0",
};

function num(v: string) {
  if (!v.trim()) return 0;
  const n = Number.parseFloat(v.replace(/,/g, "").replace(/[()]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function fmtDisplay(n: number, brackets?: boolean, blankWhenZero?: boolean) {
  if (blankWhenZero && n === 0) return brackets ? "(   )" : "";
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (brackets || n < 0) return `( ${s} )`;
  return s;
}

function fmtPounds(n: number) {
  return Math.abs(n).toFixed(2);
}

function penceToInput(n: number) {
  return (n / 100).toFixed(2);
}

function figuresToPlBs(f: Ct600TbFigures): { pl: YearPl; bs: YearBs } {
  const cash = Number(f.cashAtBankPence);
  const debtors = Number(f.debtorsPence);
  return {
    pl: {
      ...BLANK_PL,
      turnover: penceToInput(Number(f.turnoverPence)),
      interestIncome: penceToInput(Number(f.otherIncomePence)),
      costOfMaterials: penceToInput(Number(f.costOfSalesPence)),
      otherCharges: penceToInput(Number(f.administrativeExpensesPence)),
    },
    bs: {
      ...BLANK_BS,
      fixedAssets: penceToInput(Number(f.tangibleAssetsPence)),
      totalCurrentAssets: penceToInput(cash + debtors),
      creditorsWithinOneYear: penceToInput(Number(f.creditorsPence)),
      shareCapital: penceToInput(Number(f.calledUpShareCapitalPence)),
      retainedEarnings: penceToInput(Number(f.profitAndLossAccountPence)),
    },
  };
}

function formatPeriodLabel(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function yearToLabel(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "Current year";
  const d = new Date(`${iso}T12:00:00Z`);
  return `Year to ${d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function shiftYear(iso: string, delta: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + delta);
  return d.toISOString().slice(0, 10);
}

function defaultPeriodStart(periodEnd?: string | null) {
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    return "2025-04-01";
  }
  const end = new Date(`${periodEnd}T12:00:00Z`);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return 0;
  }
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

function derivePl(year: YearPl) {
  const turnover = num(year.turnover);
  const interestIncome = num(year.interestIncome);
  const totalIncome = turnover + interestIncome;
  const costOfMaterials = num(year.costOfMaterials);
  const staffCosts = num(year.staffCosts);
  const depreciation = num(year.depreciation);
  const otherCharges = num(year.otherCharges);
  const totalExpenses =
    costOfMaterials + staffCosts + depreciation + otherCharges;
  const profitBeforeTax = totalIncome - totalExpenses;
  const corporationTax = num(year.corporationTax);
  const profitForYear = profitBeforeTax - corporationTax;
  return {
    turnover,
    interestIncome,
    totalIncome,
    costOfMaterials,
    staffCosts,
    depreciation,
    otherCharges,
    totalExpenses,
    profitBeforeTax,
    corporationTax,
    profitForYear,
  };
}

function deriveBs(year: YearBs) {
  const fixedAssets = num(year.fixedAssets);
  const totalCurrentAssets = num(year.totalCurrentAssets);
  const creditorsWithin = num(year.creditorsWithinOneYear);
  const ctPayable = num(year.corporationTaxPayable);
  const totalCreditorsWithin = creditorsWithin + ctPayable;
  const netCurrentAssets = totalCurrentAssets - totalCreditorsWithin;
  const totalAssetsLessCurrent = fixedAssets + netCurrentAssets;
  const creditorsAfter = num(year.creditorsAfterOneYear);
  const netAssets = totalAssetsLessCurrent - creditorsAfter;
  const shareCapital = num(year.shareCapital);
  const retainedEarnings = num(year.retainedEarnings);
  const shareholdersFunds = shareCapital + retainedEarnings;
  return {
    fixedAssets,
    totalCurrentAssets,
    creditorsWithin,
    ctPayable,
    totalCreditorsWithin,
    netCurrentAssets,
    totalAssetsLessCurrent,
    creditorsAfter,
    netAssets,
    shareCapital,
    retainedEarnings,
    shareholdersFunds,
  };
}

export function YearEndFilingForm({
  clientId,
  initialMode,
  company,
  defaultPeriodEnd,
  defaultPeriodStart: defaultPeriodStartProp,
  accountsCheckoutHref,
  lastFiledAccounts = null,
  signInHref = "/sign-in",
  postSignInPath,
  persistKey,
  lockFilingMode = false,
  onPhaseChange,
  onContinueToPayment,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const restored = useMemo(() => {
    if (!persistKey || typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(persistKey);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [persistKey]);

  const [phase, setPhase] = useState(() =>
    typeof restored?.phase === "number" ? (restored.phase as number) : 0,
  );

  const submitSignInHref = useMemo(() => {
    const base =
      postSignInPath ??
      (() => {
        if (!signInHref.includes("next=")) return null;
        try {
          const q = signInHref.split("?")[1] ?? "";
          return new URLSearchParams(q).get("next");
        } catch {
          return null;
        }
      })();
    if (!base) return signInHref;
    return authEntryHref("sign-in", base, { step: "submit", resume: true });
  }, [postSignInPath, signInHref]);

  useEffect(() => {
    if (searchParams.get("step") === "submit") {
      setPhase(2);
    }
  }, [searchParams]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);
  const [companyType, setCompanyType] = useState<
    (typeof COMPANY_TYPES)[number]["id"]
  >(() =>
    restored?.companyType === "dormant" || restored?.companyType === "trading"
      ? (restored.companyType as "trading" | "dormant")
      : "trading",
  );
  const [filingMode, setFilingMode] = useState<YearEndFilingMode>(initialMode);
  const [periodStart, setPeriodStart] = useState(() => {
    if (typeof restored?.periodStart === "string") return restored.periodStart;
    if (
      defaultPeriodStartProp &&
      /^\d{4}-\d{2}-\d{2}$/.test(defaultPeriodStartProp)
    ) {
      return defaultPeriodStartProp;
    }
    return defaultPeriodStart(defaultPeriodEnd);
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    if (typeof restored?.periodEnd === "string") return restored.periodEnd;
    return defaultPeriodEnd && /^\d{4}-\d{2}-\d{2}$/.test(defaultPeriodEnd)
      ? defaultPeriodEnd
      : "2026-03-31";
  });
  const [customPeriod, setCustomPeriod] = useState(
    () => Boolean(restored?.customPeriod),
  );
  const [plCurrent, setPlCurrent] = useState<YearPl>(() =>
    restored?.plCurrent && typeof restored.plCurrent === "object"
      ? { ...BLANK_PL, ...(restored.plCurrent as YearPl) }
      : { ...BLANK_PL },
  );
  const [plPrevious, setPlPrevious] = useState<YearPl>(() =>
    restored?.plPrevious && typeof restored.plPrevious === "object"
      ? { ...BLANK_PL, ...(restored.plPrevious as YearPl) }
      : { ...BLANK_PL },
  );
  const [bsCurrent, setBsCurrent] = useState<YearBs>(() =>
    restored?.bsCurrent && typeof restored.bsCurrent === "object"
      ? { ...BLANK_BS, ...(restored.bsCurrent as YearBs) }
      : { ...BLANK_BS },
  );
  const [bsPrevious, setBsPrevious] = useState<YearBs>(() =>
    restored?.bsPrevious && typeof restored.bsPrevious === "object"
      ? { ...BLANK_BS, ...(restored.bsPrevious as YearBs) }
      : { ...BLANK_BS },
  );
  const [plOpen, setPlOpen] = useState(true);
  const [bsOpen, setBsOpen] = useState(true);
  const [taxOpen, setTaxOpen] = useState(true);

  const [additions, setAdditions] = useState("0");
  const [deductions, setDeductions] = useState("0");
  const [capitalAllowances, setCapitalAllowances] = useState("0");
  const [qualifyingDonations, setQualifyingDonations] = useState("0");
  const [lossesBroughtForward, setLossesBroughtForward] = useState("0");

  const directorOptions = company.directors.length
    ? company.directors
    : ["Director"];
  const [directorName, setDirectorName] = useState(directorOptions[0] ?? "");
  const [approvalDate, setApprovalDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [avgEmployees, setAvgEmployees] = useState("0");
  const [declarant, setDeclarant] = useState(directorOptions[0] ?? "");
  const [positionStatus, setPositionStatus] = useState("Director");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [taxable, setTaxable] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyAuthCode, setCompanyAuthCode] = useState("");
  const [authAttempted, setAuthAttempted] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const needsCt = filingMode === "ct600" || filingMode === "both";
  const needsAccounts = filingMode === "accounts" || filingMode === "both";
  const isDormant = companyType === "dormant";
  const showPl = !isDormant;
  /** Blank computed totals for trading until the user enters figures */
  const blankTotals = !isDormant;

  function applyCompanyType(next: (typeof COMPANY_TYPES)[number]["id"]) {
    setCompanyType(next);
    if (next === "dormant") {
      setPlCurrent({ ...ZERO_PL });
      setPlPrevious({ ...ZERO_PL });
      setBsCurrent({ ...ZERO_BS });
      setBsPrevious({ ...ZERO_BS });
    } else {
      setPlCurrent({ ...BLANK_PL });
      setPlPrevious({ ...BLANK_PL });
      setBsCurrent({ ...BLANK_BS });
      setBsPrevious({ ...BLANK_BS });
    }
  }
  const periodDays = daysBetween(periodStart, periodEnd);
  const extendedPeriod = periodDays > 365;
  const previousPeriodEnd = shiftYear(periodEnd, -1);

  const plCur = useMemo(() => derivePl(plCurrent), [plCurrent]);
  const plPrev = useMemo(() => derivePl(plPrevious), [plPrevious]);
  const bsCur = useMemo(() => deriveBs(bsCurrent), [bsCurrent]);
  const bsPrev = useMemo(() => deriveBs(bsPrevious), [bsPrevious]);

  const tradingProfitAccounts = plCur.profitBeforeTax;
  const adjustedTrading = Math.max(
    0,
    tradingProfitAccounts +
      num(additions) -
      num(deductions) -
      num(capitalAllowances),
  );
  const afterLosses = Math.max(0, adjustedTrading - num(lossesBroughtForward));
  const afterDonations = Math.max(0, afterLosses - num(qualifyingDonations));

  const balanceMismatch =
    Math.round(bsCur.netAssets) !== Math.round(bsCur.shareholdersFunds);

  function saveProgress() {
    const at = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setLastSaved(at);
    if (!persistKey) return;
    try {
      localStorage.setItem(
        persistKey,
        JSON.stringify({
          phase,
          companyType,
          filingMode,
          periodStart,
          periodEnd,
          customPeriod,
          plCurrent,
          plPrevious,
          bsCurrent,
          bsPrevious,
          directorName,
          approvalDate,
          avgEmployees,
          declarant,
          positionStatus,
          additions,
          deductions,
          capitalAllowances,
          qualifyingDonations,
          lossesBroughtForward,
        }),
      );
    } catch {
      /* ignore */
    }
  }

  function viewDraft() {
    setError(null);
    if (!directorName.trim()) {
      setError("Select the director name for signing.");
      return;
    }
    if (needsCt && (!declarant.trim() || !positionStatus.trim())) {
      setError("Please complete the tax return declaration fields.");
      return;
    }
    if (balanceMismatch) {
      setError(
        "Net assets must equal shareholders' funds. Check share capital and retained earnings.",
      );
      return;
    }
    if (!needsCt) {
      setPhase(1);
      saveProgress();
      return;
    }
    if (!clientId) {
      // Public CH flow — review figures first; CT600 submit needs a practice client
      setPhase(1);
      saveProgress();
      return;
    }
    start(async () => {
      try {
        const res = await prepareCt600({
          clientId,
          periodStart,
          periodEnd,
          turnoverPounds: fmtPounds(plCur.turnover),
          costOfSalesPounds: fmtPounds(plCur.costOfMaterials),
          administrativeExpensesPounds: fmtPounds(
            plCur.staffCosts + plCur.depreciation + plCur.otherCharges,
          ),
          otherIncomePounds: fmtPounds(plCur.interestIncome),
          tangibleAssetsPounds: fmtPounds(bsCur.fixedAssets),
          cashAtBankPounds: fmtPounds(bsCur.totalCurrentAssets),
          debtorsPounds: "0.00",
          creditorsPounds: fmtPounds(bsCur.totalCreditorsWithin),
          calledUpShareCapitalPounds: fmtPounds(bsCur.shareCapital),
          profitAndLossAccountPounds: fmtPounds(bsCur.retainedEarnings),
        });
        setDraftId(res.draft.id);
        setTaxable(res.draft.taxableProfitPence);
        setPreview(res.xmlPreview);
        setPhase(1);
        saveProgress();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to build draft");
      }
    });
  }

  const filingLabel =
    FILING_MODES.find((m) => m.id === filingMode)?.title ?? filingMode;
  const typeLabel =
    COMPANY_TYPES.find((t) => t.id === companyType)?.title ?? companyType;

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16">
      <nav
        aria-label="Filing progress"
        className="flex flex-wrap items-center justify-center gap-3 border-b border-line pb-5"
      >
        {CT600_PHASES.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3">
            <span
              className="filing-step"
              data-active={phase === i || undefined}
              data-done={phase > i || undefined}
            >
              <span>{i + 1}</span>
              {p.label}
            </span>
            {i < CT600_PHASES.length - 1 && (
              <span
                className={`hidden h-px w-8 sm:block ${
                  phase > i ? "bg-sea" : "bg-line"
                }`}
                aria-hidden
              />
            )}
          </div>
        ))}
      </nav>

      {phase === 0 && (
        <>
          <header className="text-center">
            <h1 className="display text-4xl text-ink sm:text-5xl">
              Enter Details
            </h1>
          </header>

          {/* Company summary */}
          <section className="rounded-2xl border border-sea/25 bg-sea/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-ink">
                  {company.name}
                  {company.companyNumber ? (
                    <span className="ml-2 text-base font-normal text-ink-soft">
                      ({company.companyNumber})
                    </span>
                  ) : null}
                </h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {company.registeredOffice ?? "Registered office not set"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  isDormant
                    ? "bg-danger/10 text-danger"
                    : "bg-sky-100 text-sky-800"
                }`}
              >
                {typeLabel}
              </span>
            </div>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-soft">Director</dt>
                <dd className="font-medium text-ink">{directorName || "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Accounts &amp; tax period</dt>
                <dd className="font-medium text-ink">
                  Year to {formatPeriodLabel(periodEnd)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-soft">Filing</dt>
                <dd className="font-medium text-ink">{filingLabel}</dd>
              </div>
              {company.companyStatus && (
                <div>
                  <dt className="text-ink-soft">Status</dt>
                  <dd className="font-medium capitalize text-ink">
                    {company.companyStatus}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Company type */}
          <section>
            <h2 className="text-lg font-semibold text-ink">
              What type of company is this?
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {COMPANY_TYPES.map((t) => (
                <SelectCard
                  key={t.id}
                  selected={companyType === t.id}
                  title={t.title}
                  blurb={t.blurb}
                  onClick={() => applyCompanyType(t.id)}
                />
              ))}
            </div>
            {isDormant && (
              <InfoBanner>
                Dormant filing focuses on the balance sheet. Profit &amp; loss
                is hidden when there are no significant accounting transactions.
              </InfoBanner>
            )}
          </section>

          {/* Filing mode */}
          {!lockFilingMode && (
          <section>
            <h2 className="text-lg font-semibold text-ink">
              Select what you would like to file
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {FILING_MODES.map((m) => (
                <SelectCard
                  key={m.id}
                  selected={filingMode === m.id}
                  title={m.title}
                  blurb={m.blurb}
                  onClick={() => setFilingMode(m.id)}
                />
              ))}
            </div>
            {extendedPeriod && needsCt && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-ink">
                <p className="font-semibold">
                  Extended accounting period detected
                </p>
                <p className="mt-1 text-ink-soft">
                  This period is {periodDays} days. HMRC generally requires
                  separate CT600 returns when an accounting period exceeds 12
                  months.
                </p>
              </div>
            )}
          </section>
          )}
          {lockFilingMode && (
            <p className="rounded-xl border border-sea/20 bg-sea/5 px-4 py-3 text-sm text-ink">
              Filing: <span className="font-semibold">{filingLabel}</span>
            </p>
          )}
          {extendedPeriod && needsCt && lockFilingMode && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-ink">
              <p className="font-semibold">
                Extended accounting period detected
              </p>
              <p className="mt-1 text-ink-soft">
                This period is {periodDays} days. HMRC generally requires
                separate CT600 returns when an accounting period exceeds 12
                months.
              </p>
            </div>
          )}

          {/* Accounting period */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-ink">Accounting period</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!customPeriod}
                  onChange={() => setCustomPeriod(false)}
                />
                This year ({formatPeriodLabel(periodStart)} –{" "}
                {formatPeriodLabel(periodEnd)})
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={customPeriod}
                  onChange={() => setCustomPeriod(true)}
                />
                Custom dates
              </label>
            </div>
            {customPeriod && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ye-start">
                    Period start
                  </label>
                  <input
                    id="ye-start"
                    type="date"
                    className="input"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ye-end">
                    Period end
                  </label>
                  <input
                    id="ye-end"
                    type="date"
                    className="input"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Profit & Loss — all modes except dormant */}
          {showPl && (
            <Collapsible
              title="Profit & Loss"
              open={plOpen}
              onToggle={() => setPlOpen((v) => !v)}
            >
              <TwoYearTable
                currentLabel={yearToLabel(periodEnd)}
                previousLabel={yearToLabel(previousPeriodEnd)}
              >
                <InputRow
                  label="Turnover"
                  current={plCurrent.turnover}
                  previous={plPrevious.turnover}
                  onCurrent={(v) =>
                    setPlCurrent((p) => ({ ...p, turnover: v }))
                  }
                  onPrevious={(v) =>
                    setPlPrevious((p) => ({ ...p, turnover: v }))
                  }
                />
                <InputRow
                  label="Interest income"
                  current={plCurrent.interestIncome}
                  previous={plPrevious.interestIncome}
                  onCurrent={(v) =>
                    setPlCurrent((p) => ({ ...p, interestIncome: v }))
                  }
                  onPrevious={(v) =>
                    setPlPrevious((p) => ({ ...p, interestIncome: v }))
                  }
                />
                <ComputedRow
                  label="Total income"
                  current={fmtDisplay(plCur.totalIncome, false, blankTotals)}
                  previous={fmtDisplay(plPrev.totalIncome, false, blankTotals)}
                  emphasis
                />
                <InputRow
                  label="Cost of raw materials and consumables"
                  current={plCurrent.costOfMaterials}
                  previous={plPrevious.costOfMaterials}
                  onCurrent={(v) =>
                    setPlCurrent((p) => ({ ...p, costOfMaterials: v }))
                  }
                  onPrevious={(v) =>
                    setPlPrevious((p) => ({ ...p, costOfMaterials: v }))
                  }
                  brackets
                />
                <InputRow
                  label="Staff costs"
                  current={plCurrent.staffCosts}
                  previous={plPrevious.staffCosts}
                  onCurrent={(v) =>
                    setPlCurrent((p) => ({ ...p, staffCosts: v }))
                  }
                  onPrevious={(v) =>
                    setPlPrevious((p) => ({ ...p, staffCosts: v }))
                  }
                  brackets
                />
                <InputRow
                  label="Depreciation and other amounts written off assets"
                  current={plCurrent.depreciation}
                  previous={plPrevious.depreciation}
                  onCurrent={(v) =>
                    setPlCurrent((p) => ({ ...p, depreciation: v }))
                  }
                  onPrevious={(v) =>
                    setPlPrevious((p) => ({ ...p, depreciation: v }))
                  }
                  brackets
                />
                <InputRow
                  label="Other charges"
                  current={plCurrent.otherCharges}
                  previous={plPrevious.otherCharges}
                  onCurrent={(v) =>
                    setPlCurrent((p) => ({ ...p, otherCharges: v }))
                  }
                  onPrevious={(v) =>
                    setPlPrevious((p) => ({ ...p, otherCharges: v }))
                  }
                  brackets
                />
                <ComputedRow
                  label="Total expenses"
                  current={fmtDisplay(plCur.totalExpenses, true, blankTotals)}
                  previous={fmtDisplay(plPrev.totalExpenses, true, blankTotals)}
                  emphasis
                />
                <ComputedRow
                  label="Profit before tax"
                  current={fmtDisplay(plCur.profitBeforeTax, false, blankTotals)}
                  previous={fmtDisplay(
                    plPrev.profitBeforeTax,
                    false,
                    blankTotals,
                  )}
                  emphasis
                />
                <InputRow
                  label="Corporation tax"
                  current={plCurrent.corporationTax}
                  previous={plPrevious.corporationTax}
                  onCurrent={(v) =>
                    setPlCurrent((p) => ({ ...p, corporationTax: v }))
                  }
                  onPrevious={(v) =>
                    setPlPrevious((p) => ({ ...p, corporationTax: v }))
                  }
                  brackets
                />
                <ComputedRow
                  label="Profit for the year"
                  current={fmtDisplay(plCur.profitForYear, false, blankTotals)}
                  previous={fmtDisplay(plPrev.profitForYear, false, blankTotals)}
                  emphasis
                />
              </TwoYearTable>
            </Collapsible>
          )}

          {/* Balance Sheet — all modes */}
          <Collapsible
            title="Balance Sheet"
            open={bsOpen}
            onToggle={() => setBsOpen((v) => !v)}
            action={
              <button
                type="button"
                className="rounded-lg border border-sea px-3 py-1.5 text-sm font-semibold text-sea hover:bg-sea/5"
                onClick={(e) => {
                  e.stopPropagation();
                  setError(null);
                  setImportOpen(true);
                }}
              >
                Import
              </button>
            }
          >
            <LastFiledAccountsCard filing={lastFiledAccounts} />
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink-soft">
                Category
              </span>
              <span className="rounded-md border border-sea px-2 py-0.5 text-xs font-semibold text-sea">
                Show all
              </span>
            </div>
            <TwoYearTable
              currentLabel={yearToLabel(periodEnd)}
              previousLabel={yearToLabel(previousPeriodEnd)}
            >
              <InputRow
                label="Fixed Assets"
                current={bsCurrent.fixedAssets}
                previous={bsPrevious.fixedAssets}
                onCurrent={(v) =>
                  setBsCurrent((p) => ({ ...p, fixedAssets: v }))
                }
                onPrevious={(v) =>
                  setBsPrevious((p) => ({ ...p, fixedAssets: v }))
                }
              />
              <InputRow
                label="Total Current Assets"
                current={bsCurrent.totalCurrentAssets}
                previous={bsPrevious.totalCurrentAssets}
                onCurrent={(v) =>
                  setBsCurrent((p) => ({ ...p, totalCurrentAssets: v }))
                }
                onPrevious={(v) =>
                  setBsPrevious((p) => ({ ...p, totalCurrentAssets: v }))
                }
              />
              <InputRow
                label="Creditors: amounts falling due within one year"
                current={bsCurrent.creditorsWithinOneYear}
                previous={bsPrevious.creditorsWithinOneYear}
                onCurrent={(v) =>
                  setBsCurrent((p) => ({ ...p, creditorsWithinOneYear: v }))
                }
                onPrevious={(v) =>
                  setBsPrevious((p) => ({ ...p, creditorsWithinOneYear: v }))
                }
                brackets
              />
              <InputRow
                label="Corporation Tax Payable"
                current={bsCurrent.corporationTaxPayable}
                previous={bsPrevious.corporationTaxPayable}
                onCurrent={(v) =>
                  setBsCurrent((p) => ({ ...p, corporationTaxPayable: v }))
                }
                onPrevious={(v) =>
                  setBsPrevious((p) => ({ ...p, corporationTaxPayable: v }))
                }
                brackets
              />
              <ComputedRow
                label="Total Creditors: amounts falling due within one year"
                current={fmtDisplay(
                  bsCur.totalCreditorsWithin,
                  true,
                  blankTotals,
                )}
                previous={fmtDisplay(
                  bsPrev.totalCreditorsWithin,
                  true,
                  blankTotals,
                )}
                emphasis
              />
              <ComputedRow
                label="Net Current Assets"
                current={fmtDisplay(bsCur.netCurrentAssets, false, blankTotals)}
                previous={fmtDisplay(
                  bsPrev.netCurrentAssets,
                  false,
                  blankTotals,
                )}
                emphasis
              />
              <ComputedRow
                label="Total Assets Less Current Liabilities"
                current={fmtDisplay(
                  bsCur.totalAssetsLessCurrent,
                  false,
                  blankTotals,
                )}
                previous={fmtDisplay(
                  bsPrev.totalAssetsLessCurrent,
                  false,
                  blankTotals,
                )}
                emphasis
              />
              <InputRow
                label="Creditors: amounts falling due after more than one year"
                current={bsCurrent.creditorsAfterOneYear}
                previous={bsPrevious.creditorsAfterOneYear}
                onCurrent={(v) =>
                  setBsCurrent((p) => ({ ...p, creditorsAfterOneYear: v }))
                }
                onPrevious={(v) =>
                  setBsPrevious((p) => ({ ...p, creditorsAfterOneYear: v }))
                }
                brackets
              />
              <ComputedRow
                label="Net Assets"
                current={fmtDisplay(bsCur.netAssets, false, blankTotals)}
                previous={fmtDisplay(bsPrev.netAssets, false, blankTotals)}
                emphasis
              />
              <InputRow
                label="Share Capital"
                current={bsCurrent.shareCapital}
                previous={bsPrevious.shareCapital}
                onCurrent={(v) =>
                  setBsCurrent((p) => ({ ...p, shareCapital: v }))
                }
                onPrevious={(v) =>
                  setBsPrevious((p) => ({ ...p, shareCapital: v }))
                }
              />
              <InputRow
                label="Retained Earnings"
                current={bsCurrent.retainedEarnings}
                previous={bsPrevious.retainedEarnings}
                onCurrent={(v) =>
                  setBsCurrent((p) => ({ ...p, retainedEarnings: v }))
                }
                onPrevious={(v) =>
                  setBsPrevious((p) => ({ ...p, retainedEarnings: v }))
                }
              />
              <ComputedRow
                label="Shareholders' Funds"
                current={fmtDisplay(bsCur.shareholdersFunds, false, blankTotals)}
                previous={fmtDisplay(
                  bsPrev.shareholdersFunds,
                  false,
                  blankTotals,
                )}
                emphasis
              />
            </TwoYearTable>
            {balanceMismatch && (
              <p className="mt-3 text-sm text-danger">
                Net assets ({fmtDisplay(bsCur.netAssets)}) must equal
                shareholders&apos; funds ({fmtDisplay(bsCur.shareholdersFunds)}
                ).
              </p>
            )}
          </Collapsible>

          {/* Tax Computation — CT600 only & both */}
          {needsCt && (
            <Collapsible
              title="Tax Computation — Current Year"
              open={taxOpen}
              onToggle={() => setTaxOpen((v) => !v)}
              tint
            >
              <div className="space-y-5">
                <div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-sea">
                    Trading profits
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReadField
                      label="Trading profit / (loss) per accounts"
                      value={fmtDisplay(tradingProfitAccounts)}
                    />
                    <div>
                      <label className="label">
                        Additions (e.g. depreciation not deductible)
                      </label>
                      <input
                        className="input mono"
                        value={additions}
                        onChange={(e) => setAdditions(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Deductions</label>
                      <input
                        className="input mono"
                        value={deductions}
                        onChange={(e) => setDeductions(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label">Capital allowances</label>
                      <input
                        className="input mono"
                        value={capitalAllowances}
                        onChange={(e) => setCapitalAllowances(e.target.value)}
                      />
                    </div>
                    <ReadField
                      label="Adjusted trading profit / (loss)"
                      value={fmtDisplay(adjustedTrading)}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-sea">
                    Availability of losses
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Losses brought forward</label>
                      <input
                        className="input mono"
                        value={lossesBroughtForward}
                        onChange={(e) => setLossesBroughtForward(e.target.value)}
                      />
                    </div>
                    <ReadField
                      label="Profits after losses brought forward"
                      value={fmtDisplay(afterLosses)}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-sea">
                    Corporation tax — net taxable
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label">Qualifying donations</label>
                      <input
                        className="input mono"
                        value={qualifyingDonations}
                        onChange={(e) =>
                          setQualifyingDonations(e.target.value)
                        }
                      />
                    </div>
                    <ReadField
                      label="Net taxable profit / (loss)"
                      value={fmtDisplay(afterDonations)}
                    />
                  </div>
                </div>
              </div>
            </Collapsible>
          )}

          {/* Accounts Information — all three filing modes */}
          <section className="space-y-3 rounded-2xl border border-line p-5">
            <h2 className="text-lg font-semibold text-ink">
              Accounts Information
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="ye-director">
                  Director Name (for signing)
                </label>
                <select
                  id="ye-director"
                  className="input"
                  value={directorName}
                  onChange={(e) => {
                    setDirectorName(e.target.value);
                    if (!declarant || directorOptions.includes(declarant)) {
                      setDeclarant(e.target.value);
                    }
                  }}
                >
                  {directorOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="ye-approval">
                  Accounts Approval Date
                </label>
                <input
                  id="ye-approval"
                  type="date"
                  className="input"
                  value={approvalDate}
                  onChange={(e) => setApprovalDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="ye-employees">
                  Average # of Employees
                </label>
                <input
                  id="ye-employees"
                  className="input mono"
                  inputMode="numeric"
                  value={avgEmployees}
                  onChange={(e) =>
                    setAvgEmployees(e.target.value.replace(/[^\d]/g, ""))
                  }
                />
              </div>
            </div>
          </section>

          {/* Tax Return Declaration — CT600 only & both */}
          {needsCt && (
            <section className="space-y-3 rounded-2xl border border-line p-5">
              <h2 className="text-lg font-semibold text-ink">
                Tax Return Declaration
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ye-declarant">
                    Person Making Declaration
                  </label>
                  <select
                    id="ye-declarant"
                    className="input"
                    value={declarant}
                    onChange={(e) => setDeclarant(e.target.value)}
                  >
                    {directorOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="ye-position">
                    Position / Status
                  </label>
                  <input
                    id="ye-position"
                    className="input"
                    value={positionStatus}
                    onChange={(e) => setPositionStatus(e.target.value)}
                  />
                </div>
              </div>
            </section>
          )}

          <FormErrorBanner error={error} />

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="btn btn-secondary flex-1"
              onClick={saveProgress}
            >
              Save Progress
            </button>
            <button
              type="button"
              className="btn btn-primary flex-1"
              disabled={pending}
              onClick={viewDraft}
            >
              {pending ? "Building draft…" : "View Draft Submission"}
            </button>
          </div>
          {lastSaved && (
            <p className="text-center text-xs text-ink-soft">
              Saved at {lastSaved}.
            </p>
          )}
        </>
      )}

      {phase === 1 && (
        <ReviewPhase
          companyName={company.name}
          periodStart={periodStart}
          periodEnd={periodEnd}
          previousPeriodEnd={previousPeriodEnd}
          filingLabel={filingLabel}
          plCur={plCur}
          plPrev={plPrev}
          bsCur={bsCur}
          bsPrev={bsPrev}
          showPl={showPl}
          needsCt={needsCt}
          needsAccounts={needsAccounts}
          directorName={directorName}
          approvalDate={approvalDate}
          avgEmployees={avgEmployees}
          declarant={declarant}
          positionStatus={positionStatus}
          taxable={taxable}
          netTaxable={afterDonations}
          preview={preview}
          onBack={() => setPhase(0)}
          onNext={() => {
            saveProgress();
            setPhase(2);
          }}
        />
      )}

      {phase === 2 && (
        <div className="space-y-5">
          <header className="text-center">
            <h1 className="display text-4xl text-ink">Submit Returns</h1>
            <p className="mt-2 text-sm text-ink-soft">
              Complete the selected filings for {company.name}.
            </p>
          </header>

          {needsCt && (
            <div className="rounded-2xl border border-line p-5">
              <h2 className="font-semibold text-ink">Corporation Tax (CT600)</h2>
              {clientId ? (
                <>
                  <p className="mt-1 text-sm text-ink-soft">
                    Submit to HMRC CT Online. Ensure UTR and HMRC credentials are
                    connected in Settings.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary mt-4"
                    disabled={!draftId || pending}
                    onClick={() =>
                      start(async () => {
                        if (!draftId || !clientId) return;
                        const res = await submitCt600(draftId, clientId);
                        setMessage(`CT600 submitted · ${res.res.correlationId}`);
                        router.refresh();
                      })
                    }
                  >
                    {pending ? "Submitting…" : "Submit CT600 to HMRC"}
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-sm text-ink-soft">
                    CT600 submission needs a practice client with UTR and HMRC
                    connection. Sign in to continue from your desk, or file
                    accounts only below.
                  </p>
                  <Link
                    href={submitSignInHref}
                    className="btn btn-primary mt-4 inline-flex"
                    onClick={() => saveProgress()}
                  >
                    Sign in to submit CT600
                  </Link>
                </>
              )}
            </div>
          )}

          {needsAccounts && (
            <div className="rounded-2xl border border-line p-5">
              <h2 className="font-semibold text-ink">
                Companies House accounts
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Enter the company authentication code before continuing to
                payment. Checkout will not open without it.
              </p>
              <label className="label mt-4">
                Company authentication code
                <span className="font-normal text-danger"> *</span>
                <input
                  className={`input mt-1.5 mono ${
                    authAttempted && !companyAuthCode.trim()
                      ? "border-danger"
                      : ""
                  }`}
                  value={companyAuthCode}
                  onChange={(e) => setCompanyAuthCode(e.target.value)}
                  placeholder="Authentication code"
                  autoComplete="off"
                  required
                />
              </label>
              {authAttempted && !companyAuthCode.trim() && (
                <p className="mt-2 text-sm text-danger" role="alert">
                  Enter the company authentication code to continue.
                </p>
              )}
              {onContinueToPayment ? (
                <button
                  type="button"
                  className="btn btn-primary mt-4"
                  onClick={() => {
                    setAuthAttempted(true);
                    if (!companyAuthCode.trim()) return;
                    saveProgress();
                    try {
                      sessionStorage.setItem(
                        `hydratax_ch_auth_${company.companyNumber}`,
                        companyAuthCode.trim(),
                      );
                    } catch {
                      /* ignore */
                    }
                    onContinueToPayment({
                      periodStart,
                      periodEnd,
                      companyType,
                    });
                  }}
                >
                  Continue to payment
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary mt-4"
                  onClick={() => {
                    setAuthAttempted(true);
                    if (!companyAuthCode.trim()) return;
                    saveProgress();
                    try {
                      sessionStorage.setItem(
                        `hydratax_ch_auth_${company.companyNumber}`,
                        companyAuthCode.trim(),
                      );
                    } catch {
                      /* ignore */
                    }
                    window.location.href = accountsCheckoutHref;
                  }}
                >
                  Continue to accounts filing
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPhase(1)}
          >
            Back to review
          </button>
        </div>
      )}

      {message && <p className="text-sm font-semibold text-ok">{message}</p>}

      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setImportOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Import trial balance"
            className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
                  Trial balance
                </p>
                <h3 className="mt-1 text-xl font-semibold text-ink">
                  Import into P&amp;L and Balance Sheet
                </h3>
                <p className="mt-1 text-sm text-ink-soft">
                  Upload Excel or CSV for {formatPeriodLabel(periodStart)} –{" "}
                  {formatPeriodLabel(periodEnd)}. Adjust account mappings, then
                  apply.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary shrink-0 px-3 text-sm"
                onClick={() => setImportOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              <TrialBalanceUpload
                clientId={clientId}
                purpose="ct600"
                periodStart={periodStart}
                periodEnd={periodEnd}
                applyLabel="Apply to form"
                onApplyFigures={({ figures }) => {
                  const mapped = figuresToPlBs(figures);
                  setPlCurrent(mapped.pl);
                  setBsCurrent(mapped.bs);
                  setPlOpen(true);
                  setBsOpen(true);
                  setImportOpen(false);
                  setError(null);
                  setMessage(
                    "Trial balance figures applied to the current year P&L and Balance Sheet.",
                  );
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewPhase({
  companyName,
  periodStart,
  periodEnd,
  previousPeriodEnd,
  filingLabel,
  plCur,
  plPrev,
  bsCur,
  bsPrev,
  showPl,
  needsCt,
  needsAccounts,
  directorName,
  approvalDate,
  avgEmployees,
  declarant,
  positionStatus,
  taxable,
  netTaxable,
  preview,
  onBack,
  onNext,
}: {
  companyName: string;
  periodStart: string;
  periodEnd: string;
  previousPeriodEnd: string;
  filingLabel: string;
  plCur: ReturnType<typeof derivePl>;
  plPrev: ReturnType<typeof derivePl>;
  bsCur: ReturnType<typeof deriveBs>;
  bsPrev: ReturnType<typeof deriveBs>;
  showPl: boolean;
  needsCt: boolean;
  needsAccounts: boolean;
  directorName: string;
  approvalDate: string;
  avgEmployees: string;
  declarant: string;
  positionStatus: string;
  taxable: number | null;
  netTaxable: number;
  preview: string | null;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <header className="text-center">
        <h1 className="display text-4xl text-ink">Review Documents</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {companyName} · {formatPeriodLabel(periodStart)} →{" "}
          {formatPeriodLabel(periodEnd)} · {filingLabel}
        </p>
      </header>

      {showPl && (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <p className="border-b border-line bg-sand/40 px-4 py-2 text-sm font-semibold text-ink">
            Profit &amp; Loss
          </p>
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-line text-ink-soft">
                <th className="px-4 py-2 text-left font-semibold">Category</th>
                <th className="w-36 px-3 py-2 text-right font-semibold">
                  {yearToLabel(periodEnd)}
                </th>
                <th className="w-36 px-4 py-2 text-right font-semibold">
                  {yearToLabel(previousPeriodEnd)}
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Turnover", plCur.turnover, plPrev.turnover, false],
                  [
                    "Total income",
                    plCur.totalIncome,
                    plPrev.totalIncome,
                    false,
                  ],
                  [
                    "Total expenses",
                    plCur.totalExpenses,
                    plPrev.totalExpenses,
                    true,
                  ],
                  [
                    "Profit before tax",
                    plCur.profitBeforeTax,
                    plPrev.profitBeforeTax,
                    false,
                  ],
                  [
                    "Profit for the year",
                    plCur.profitForYear,
                    plPrev.profitForYear,
                    false,
                  ],
                ] as const
              ).map(([label, c, p, brackets]) => (
                <tr key={label} className="border-b border-line/70">
                  <td className="px-4 py-2 font-medium text-ink">{label}</td>
                  <td className="mono px-3 py-2 text-right">
                    {fmtDisplay(c, brackets)}
                  </td>
                  <td className="mono px-4 py-2 text-right">
                    {fmtDisplay(p, brackets)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line">
        <p className="border-b border-line bg-sand/40 px-4 py-2 text-sm font-semibold text-ink">
          Balance Sheet
        </p>
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-2 text-left font-semibold">Category</th>
              <th className="w-36 px-3 py-2 text-right font-semibold">
                {yearToLabel(periodEnd)}
              </th>
              <th className="w-36 px-4 py-2 text-right font-semibold">
                {yearToLabel(previousPeriodEnd)}
              </th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Fixed Assets", bsCur.fixedAssets, bsPrev.fixedAssets, false],
                [
                  "Net Current Assets",
                  bsCur.netCurrentAssets,
                  bsPrev.netCurrentAssets,
                  false,
                ],
                ["Net Assets", bsCur.netAssets, bsPrev.netAssets, false],
                [
                  "Shareholders' Funds",
                  bsCur.shareholdersFunds,
                  bsPrev.shareholdersFunds,
                  false,
                ],
              ] as const
            ).map(([label, c, p, brackets]) => (
              <tr key={label} className="border-b border-line/70">
                <td className="px-4 py-2 font-medium text-ink">{label}</td>
                <td className="mono px-3 py-2 text-right">
                  {fmtDisplay(c, brackets)}
                </td>
                <td className="mono px-4 py-2 text-right">
                  {fmtDisplay(p, brackets)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-line bg-white p-4">
          <h3 className="font-semibold text-ink">Accounts</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Signed by {directorName} · approved{" "}
            {formatPeriodLabel(approvalDate)} · avg employees {avgEmployees}
          </p>
        </article>
        {needsCt && (
          <article className="rounded-xl border border-line bg-white p-4">
            <h3 className="font-semibold text-ink">CT600 declaration</h3>
            <p className="mt-1 text-sm text-ink-soft">
              {declarant} ({positionStatus}) · net taxable{" "}
              {fmtDisplay(netTaxable)}
              {taxable != null ? ` · draft ${money(taxable)}` : ""}
            </p>
          </article>
        )}
      </div>

      {preview && (
        <pre className="max-h-48 overflow-auto rounded-md bg-ink p-3 text-xs text-sand">
          {preview}
        </pre>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Edit details
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Proceed to submit
        </button>
      </div>
    </div>
  );
}

function SelectCard({
  selected,
  title,
  blurb,
  onClick,
}: {
  selected: boolean;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        selected
          ? "border-sea bg-sea/5 shadow-sm"
          : "border-line bg-white hover:border-sea/40"
      }`}
    >
      <p className="font-semibold text-ink">
        {selected ? "✓ " : ""}
        {title}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{blurb}</p>
    </button>
  );
}

function InfoBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-ink">
      {children}
    </div>
  );
}

function Collapsible({
  title,
  open,
  onToggle,
  tint,
  action,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  tint?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border ${
        tint ? "border-sea/25 bg-sea/5" : "border-line bg-white"
      }`}
    >
      <div className="flex items-center gap-3 border-b border-sea/30 px-5 py-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between text-left"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="text-lg font-semibold text-ink">{title}</span>
          <span className="text-sea" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </button>
        {action}
      </div>
      {open && <div className="px-5 pb-5 pt-4">{children}</div>}
    </section>
  );
}

function LastFiledAccountsCard({
  filing,
}: {
  filing: LastFiledAccounts | null;
}) {
  const [open, setOpen] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);

  const previewUrl = filing?.chPreviewUrl || filing?.localPreviewUrl || null;
  const isImage =
    !!previewUrl &&
    !filing?.chPreviewUrl &&
    !!filing?.localPreviewUrl?.match(/\.(png|jpe?g|webp)(\?|$)/i);

  useEffect(() => {
    if (!open || !filing?.chPreviewUrl) {
      if (open && filing?.localPreviewUrl) setPreviewStatus("ready");
      return;
    }
    let cancelled = false;
    setPreviewStatus("loading");
    setPreviewError(null);
    const checkUrl = `${filing.chPreviewUrl}${filing.chPreviewUrl.includes("?") ? "&" : "?"}check=1`;
    fetch(checkUrl, { credentials: "same-origin" })
      .then(async (res) => {
        if (cancelled) return;
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            (body && typeof body.error === "string" && body.error) ||
              `Could not load accounts (${res.status})`,
          );
        }
        setPreviewStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewStatus("error");
        setPreviewError(
          err instanceof Error ? err.message : "Could not load accounts document",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, filing?.chPreviewUrl, filing?.localPreviewUrl]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-sand/40 px-4 py-3 text-left transition hover:border-sea/40 hover:bg-sand/70"
      >
        <div>
          <p className="font-semibold text-ink">View last filed accounts</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {filing?.madeUpTo
              ? `Made up to ${formatPeriodLabel(filing.madeUpTo)}`
              : filing
                ? "Latest accounts on the Companies House register"
                : "Open when a prior filing is available"}
            {filing?.filedOn
              ? ` · filed ${formatPeriodLabel(filing.filedOn)}`
              : ""}
          </p>
        </div>
        <div className="relative shrink-0">
          <AccountsDocThumb pages={filing?.pages} />
          <span
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-sea text-white shadow"
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="6"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16 16l4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Last filed accounts"
            className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sea">
                  Last filed accounts
                </p>
                <h3 className="mt-1 text-xl font-semibold text-ink">
                  {filing?.description ?? "Accounts filing"}
                </h3>
                <p className="mt-1 text-sm text-ink-soft">
                  {filing?.madeUpTo
                    ? `Period ended ${formatPeriodLabel(filing.madeUpTo)}`
                    : "Prior year accounts"}
                  {filing?.filedOn
                    ? ` · filed ${formatPeriodLabel(filing.filedOn)}`
                    : ""}
                  {filing?.chPreviewUrl ? " · from Companies House" : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary shrink-0 px-3 text-sm"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-sand/40">
              {previewStatus === "loading" && (
                <div className="flex h-[70vh] min-h-[28rem] items-center justify-center p-6 text-sm text-ink-soft">
                  Loading accounts from Companies House…
                </div>
              )}
              {previewStatus === "error" && (
                <div className="space-y-3 p-6 text-center">
                  <AccountsDocThumb large pages={filing?.pages} />
                  <p className="text-sm text-danger">
                    {previewError ?? "Could not load the filed accounts PDF."}
                  </p>
                  <p className="text-sm text-ink-soft">
                    You can still open the filing on Companies House below.
                  </p>
                </div>
              )}
              {(previewStatus === "ready" ||
                (previewStatus === "idle" && isImage)) &&
                previewUrl &&
                isImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Last filed accounts preview"
                    className="mx-auto max-h-[70vh] bg-white"
                  />
                )}
              {previewStatus === "ready" && previewUrl && !isImage && (
                <AccountsPdfScrollViewer src={previewUrl} />
              )}
              {!previewUrl && previewStatus !== "loading" && (
                <div className="space-y-3 p-6 text-center">
                  <AccountsDocThumb large pages={filing?.pages} />
                  <p className="text-sm text-ink-soft">
                    No document is available to preview for this company yet.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {filing?.chPreviewUrl && (
                <a
                  href={filing.chPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                >
                  Open PDF
                </a>
              )}
              {filing?.registerUrl && (
                <a
                  href={filing.registerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                >
                  Open filing on Companies House
                </a>
              )}
              {filing?.companyFilingHistoryUrl && (
                <a
                  href={filing.companyFilingHistoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                >
                  All accounts filings
                </a>
              )}
              {!filing && (
                <p className="text-sm text-ink-soft">
                  No prior accounts filing found for this company yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AccountsDocThumb({
  large,
  pages,
}: {
  large?: boolean;
  pages?: number | null;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded border border-line bg-white shadow-sm ${
        large ? "mx-auto aspect-[3/4] w-56" : "h-16 w-12"
      }`}
      aria-hidden
    >
      <div className="absolute inset-x-0 top-0 h-2 bg-sea/80" />
      <div className={`space-y-1.5 ${large ? "p-4 pt-5" : "p-1.5 pt-2.5"}`}>
        <div className="h-1 rounded bg-line" />
        <div className="h-1 w-4/5 rounded bg-line" />
        <div className="h-1 w-3/5 rounded bg-line" />
        {large && (
          <>
            <div className="mt-3 h-1 rounded bg-line" />
            <div className="h-1 w-5/6 rounded bg-line" />
            <div className="h-1 w-2/3 rounded bg-line" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="h-8 rounded bg-sand" />
              <div className="h-8 rounded bg-sand" />
            </div>
          </>
        )}
      </div>
      {pages != null && pages > 0 && (
        <span
          className={`absolute bottom-1 right-1 rounded bg-ink/80 px-1 font-semibold text-white ${
            large ? "text-xs" : "text-[8px]"
          }`}
        >
          {pages}p
        </span>
      )}
    </div>
  );
}

function TwoYearTable({
  currentLabel,
  previousLabel,
  children,
}: {
  currentLabel: string;
  previousLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-soft">
            <th className="py-2 pr-3 font-semibold">Category</th>
            <th className="w-36 py-2 px-2 text-right font-semibold">
              {currentLabel}
            </th>
            <th className="w-36 py-2 pl-2 text-right font-semibold">
              {previousLabel}
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function InputRow({
  label,
  current,
  previous,
  onCurrent,
  onPrevious,
  brackets,
}: {
  label: string;
  current: string;
  previous: string;
  onCurrent: (v: string) => void;
  onPrevious: (v: string) => void;
  brackets?: boolean;
}) {
  return (
    <tr className="border-b border-line/60">
      <td className="py-2.5 pr-3 text-ink">{label}</td>
      <td className="px-2 py-2">
        <MoneyInput value={current} onChange={onCurrent} brackets={brackets} />
      </td>
      <td className="pl-2 py-2">
        <MoneyInput
          value={previous}
          onChange={onPrevious}
          brackets={brackets}
        />
      </td>
    </tr>
  );
}

function ComputedRow({
  label,
  current,
  previous,
  emphasis,
}: {
  label: string;
  current: string;
  previous: string;
  emphasis?: boolean;
}) {
  return (
    <tr className="border-b border-line/60 bg-sand/30">
      <td
        className={`py-2.5 pr-3 ${emphasis ? "font-semibold text-ink" : "text-ink"}`}
      >
        {label}
      </td>
      <td
        className={`mono px-2 py-2.5 text-right ${emphasis ? "font-semibold" : ""}`}
      >
        {current}
      </td>
      <td
        className={`mono pl-2 py-2.5 text-right ${emphasis ? "font-semibold" : ""}`}
      >
        {previous}
      </td>
    </tr>
  );
}

function MoneyInput({
  value,
  onChange,
  brackets,
}: {
  value: string;
  onChange: (v: string) => void;
  brackets?: boolean;
}) {
  return (
    <div
      className={`flex items-center rounded-lg border border-line bg-white transition focus-within:border-sea focus-within:ring-2 focus-within:ring-sea/20 ${
        brackets ? "gap-0.5 px-2" : "px-2"
      }`}
    >
      {brackets && (
        <span className="select-none font-medium text-ink-soft" aria-hidden>
          (
        </span>
      )}
      <input
        className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-right font-mono text-sm text-ink outline-none placeholder:text-ink-soft/40"
        inputMode="decimal"
        value={value}
        placeholder=""
        onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ""))}
        aria-label={brackets ? "Amount (shown as a deduction)" : undefined}
      />
      {brackets && (
        <span className="select-none font-medium text-ink-soft" aria-hidden>
          )
        </span>
      )}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input mono bg-sand/40" value={value} readOnly />
    </div>
  );
}

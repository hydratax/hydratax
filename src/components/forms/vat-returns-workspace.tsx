"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  draftVatBoxesFromBank,
  prepareVatReturnFromBoxes,
  pullVatBoxesFromBooks,
  refreshVatObligationsFromHmrc,
  submitPreparedVatReturn,
} from "@/server/actions/vat";
import {
  buildVatOverridesFromChoices,
  categoriesNeedingVatAllocate,
  type VatAllocateChoice,
} from "@/lib/vat-box-allocate";
import { parseMtdVatFile } from "@/lib/mtd/parse-mtd-vat-file";
import { MtdFileUploadButton } from "@/components/forms/mtd-file-upload-button";
import { disconnectHmrcAction } from "@/server/actions/hmrc-connect";
import {
  gatherFraudMetadata,
  warmFraudHeaders,
} from "@/components/fraud-metadata";
import { HmrcVatConnectModal } from "@/components/forms/hmrc-vat-connect-modal";
import {
  txsForPeriod,
  VatBooksBankPanel,
  VatQuarterBreakdowns,
} from "@/components/forms/vat-bank-desk";
import { VatPullStatementsDialog } from "@/components/forms/vat-pull-statements-dialog";
import { UkDateField } from "@/components/forms/uk-date-field";
import { AbbrInfo } from "@/components/desk/abbr-info";
import { VAT_BOX_DEFINITIONS } from "@/lib/hmrc/filing-guides";
import { money } from "@/lib/format";
import { pence } from "@/server/money/pence";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { EmailToClientButton } from "@/components/forms/email-to-client-button";
import {
  humanizeHmrcFailure,
  isHmrcSuccessResult,
  messageForHmrcResult,
} from "@/lib/hmrc-user-messages";
import {
  TrialSubmitConfirmPanel,
  useTrialSubmitGate,
} from "@/components/forms/trial-submit-confirm";
import {
  clampPeriodsToRegistration,
  formatPeriodRange,
  formatVatPeriodLabel,
  latestVatPeriodWindowStart,
  makeVatPeriod,
  nextVatPeriodAfter,
  periodsFromRegistrationDate,
  sliceVatPeriodWindow,
  VAT_PERIOD_WINDOW_SIZE,
} from "@/lib/vat-periods";
import type { VatBoxRollupPence } from "@/server/bank/vat-box-map";
import type { BankStatementDocSummary } from "@/lib/bank/statement-docs";
import type { CustomCategoryRow } from "@/server/actions/custom-categories";
import Link from "next/link";

/** Only HMRC-filed / accepted returns belong under Submitted — not draft "ready". */
function isFiledVatReturn(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === "submitted" ||
    s === "accepted" ||
    s === "fulfilled" ||
    s === "f"
  );
}

/** HMRC open obligation, or any non-fulfilled period — never treat READY as filed. */
function isOpenObligation(status: string): boolean {
  const s = status.trim().toUpperCase();
  if (s === "F" || s === "FULFILLED") return false;
  return true;
}

type Obligation = {
  periodKey: string;
  start: string;
  end: string;
  due: string;
  status: string;
  received?: string;
  title?: string;
};

type ReturnRow = {
  id: string;
  periodKey: string;
  status: string;
  boxes?: Record<string, string> | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

type BankTx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
  source?: string | null;
};

type BoxKey = (typeof VAT_BOX_DEFINITIONS)[number]["key"];

type BoxInputs = Record<BoxKey, string>;

const EMPTY_BOXES: BoxInputs = {
  vatDueSales: "",
  vatDueAcquisitions: "",
  totalVatDue: "",
  vatReclaimedCurrPeriod: "",
  netVatDue: "",
  totalValueSalesExVAT: "",
  totalValuePurchasesExVAT: "",
  totalValueGoodsSuppliedExVAT: "",
  totalAcquisitionsExVAT: "",
};

const BOX_SHORT: Record<BoxKey, string> = {
  vatDueSales: "VAT due on sales and other outputs",
  vatDueAcquisitions: "VAT due on EC acquisitions",
  totalVatDue: "Total VAT due (Box 1 + Box 2)",
  vatReclaimedCurrPeriod: "VAT reclaimed on purchases",
  netVatDue: "Net VAT (Box 3 − Box 4)",
  totalValueSalesExVAT: "Total sales (excl. VAT)",
  totalValuePurchasesExVAT: "Total purchases (excl. VAT)",
  totalValueGoodsSuppliedExVAT: "Goods supplied to EC (excl. VAT)",
  totalAcquisitionsExVAT: "Acquisitions from EC (excl. VAT)",
};

const COMPUTED: BoxKey[] = ["totalVatDue", "netVatDue"];

function parsePounds(raw: string): number {
  const cleaned = raw.replace(/[£,\s]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Accounting display: thousands commas + two decimal places (en-GB). */
function penceToField(penceValue: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(penceValue / 100);
}

function formatAccountingField(raw: string): string {
  const cleaned = raw.replace(/[£,\s]/g, "").trim();
  if (!cleaned) return "";
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return raw;
  return penceToField(Math.round(n * 100));
}

function prettyDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function boxesFromRollup(b: VatBoxRollupPence): BoxInputs {
  return {
    vatDueSales: penceToField(Number(b.vatDueSales)),
    vatDueAcquisitions: penceToField(Number(b.vatDueAcquisitions)),
    totalVatDue: penceToField(Number(b.totalVatDue)),
    vatReclaimedCurrPeriod: penceToField(Number(b.vatReclaimedCurrPeriod)),
    netVatDue: penceToField(Number(b.netVatDue)),
    totalValueSalesExVAT: penceToField(Number(b.totalValueSalesExVAT)),
    totalValuePurchasesExVAT: penceToField(Number(b.totalValuePurchasesExVAT)),
    totalValueGoodsSuppliedExVAT: penceToField(
      Number(b.totalValueGoodsSuppliedExVAT),
    ),
    totalAcquisitionsExVAT: penceToField(Number(b.totalAcquisitionsExVAT)),
  };
}

function boxesFromStored(
  stored: Record<string, string> | null | undefined,
): BoxInputs {
  if (!stored) return { ...EMPTY_BOXES };
  const next = { ...EMPTY_BOXES };
  for (const key of Object.keys(EMPTY_BOXES) as BoxKey[]) {
    const raw = stored[key];
    if (raw == null || raw === "") continue;
    next[key] = formatAccountingField(String(raw));
  }
  return next;
}

function findDraftForPeriod(
  rows: ReturnRow[],
  period: Obligation | null,
): ReturnRow | null {
  if (!period) return null;
  const drafts = rows.filter((r) => !isFiledVatReturn(r.status));
  return (
    drafts.find((r) => r.periodKey === period.periodKey) ??
    drafts.find(
      (r) =>
        r.periodStart === period.start && r.periodEnd === period.end,
    ) ??
    null
  );
}

export function VatReturnsWorkspace({
  clientId,
  clientName,
  contactEmail = null,
  vrn,
  vatRegistrationDate = null,
  connected,
  signedIn,
  initialHmrcResult = null,
  obligations,
  returns,
  bankTransactionCount = 0,
  bankStatements = [],
  bankTransactions = [],
  customCategories = [],
  clientSlug,
}: {
  clientId: string;
  clientName: string;
  contactEmail?: string | null;
  vrn: string | null;
  vatRegistrationDate?: string | null;
  connected: boolean;
  signedIn: boolean;
  /** From `?hmrc=` after OAuth return. */
  initialHmrcResult?: string | null;
  obligations: Obligation[];
  returns: ReturnRow[];
  bankTransactionCount?: number;
  bankEarliest?: string | null;
  bankLatest?: string | null;
  bankStatements?: BankStatementDocSummary[];
  bankTransactions?: BankTx[];
  customCategories?: CustomCategoryRow[];
  clientSlug?: string;
}) {
  const router = useRouter();
  const [connectOpen, setConnectOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const [pullPeriod, setPullPeriod] = useState<{
    periodKey: string;
    start: string;
    end: string;
    title?: string;
  } | null>(null);
  const [vatAllocateByCategory, setVatAllocateByCategory] = useState<
    Record<string, VatAllocateChoice>
  >({});
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [pending, start] = useTransition();
  const trialGate = useTrialSubmitGate();
  const [periodList, setPeriodList] = useState<Obligation[]>(obligations);
  const [hmrcPeriods, setHmrcPeriods] = useState(false);
  const [windowStart, setWindowStart] = useState(() =>
    latestVatPeriodWindowStart(obligations.length),
  );
  const openObligations = periodList.filter((o) => isOpenObligation(o.status));
  const [returnRows, setReturnRows] = useState<ReturnRow[]>(returns);
  const filedReturns = useMemo(
    () => returnRows.filter((r) => isFiledVatReturn(r.status)),
    [returnRows],
  );
  const [selected, setSelected] = useState(
    openObligations[0]?.periodKey ?? periodList[0]?.periodKey ?? "",
  );
  const [boxes, setBoxes] = useState<BoxInputs>({ ...EMPTY_BOXES });
  const [message, setMessage] = useState<string | null>(null);
  const [hmrcNotice, setHmrcNotice] = useState<{
    text: string;
    ok: boolean;
  } | null>(() => {
    const text = messageForHmrcResult(initialHmrcResult);
    if (!text) return null;
    return { text, ok: isHmrcSuccessResult(initialHmrcResult) };
  });
  const [error, setError] = useState<string | null>(null);
  const userCustomPeriodsRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef(true);
  const hmrcQueryClearedRef = useRef(false);

  useEffect(() => {
    if (!initialHmrcResult || hmrcQueryClearedRef.current) return;
    hmrcQueryClearedRef.current = true;
    const text = messageForHmrcResult(initialHmrcResult);
    if (text) {
      setHmrcNotice({
        text,
        ok: isHmrcSuccessResult(initialHmrcResult),
      });
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("hmrc")) {
        url.searchParams.delete("hmrc");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch {
      /* ignore */
    }
  }, [initialHmrcResult]);

  const hasVrn = Boolean(vrn);
  const hasVatRegDate = Boolean(
    vatRegistrationDate && /^\d{4}-\d{2}-\d{2}$/.test(vatRegistrationDate),
  );
  const vatIdsReady = hasVrn && hasVatRegDate;
  const obligation = periodList.find((o) => o.periodKey === selected) ?? null;

  useEffect(() => {
    setReturnRows(returns);
  }, [returns]);

  /** Never carry figures across quarters — load this period's draft or blanks. */
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    skipNextAutosaveRef.current = true;
    const draft = findDraftForPeriod(returnRows, obligation);
    setBoxes(boxesFromStored(draft?.boxes ?? null));
    setMessage(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when period changes
  }, [selected, obligation?.periodKey, obligation?.start, obligation?.end]);

  function persistBoxesNow(nextBoxes: BoxInputs) {
    if (!obligation || !vatIdsReady) return;
    const b1 = parsePounds(nextBoxes.vatDueSales);
    const b2 = parsePounds(nextBoxes.vatDueAcquisitions);
    const b4 = parsePounds(nextBoxes.vatReclaimedCurrPeriod);
    const total = b1 + b2;
    const net = total - b4;
    const penceBoxes = {
      vatDueSales: pence(b1),
      vatDueAcquisitions: pence(b2),
      totalVatDue: pence(total),
      vatReclaimedCurrPeriod: pence(b4),
      netVatDue: pence(net),
      totalValueSalesExVAT: pence(
        parsePounds(nextBoxes.totalValueSalesExVAT),
      ),
      totalValuePurchasesExVAT: pence(
        parsePounds(nextBoxes.totalValuePurchasesExVAT),
      ),
      totalValueGoodsSuppliedExVAT: pence(
        parsePounds(nextBoxes.totalValueGoodsSuppliedExVAT),
      ),
      totalAcquisitionsExVAT: pence(
        parsePounds(nextBoxes.totalAcquisitionsExVAT),
      ),
    };
    const displayBoxes = boxesFromRollup(penceBoxes);
    start(async () => {
      try {
        const saved = await prepareVatReturnFromBoxes({
          clientId,
          periodKey: obligation.periodKey,
          periodStart: obligation.start,
          periodEnd: obligation.end,
          boxes: penceBoxes,
        });
        setReturnRows((prev) => {
          const others = prev.filter((r) => {
            if (isFiledVatReturn(r.status)) return true;
            const sameKey = r.periodKey === obligation.periodKey;
            const sameDates =
              r.periodStart === obligation.start &&
              r.periodEnd === obligation.end;
            return !sameKey && !sameDates;
          });
          return [
            ...others,
            {
              id: String(saved.id),
              periodKey: obligation.periodKey,
              status: String(saved.status ?? "ready"),
              boxes: displayBoxes,
              periodStart: obligation.start,
              periodEnd: obligation.end,
            },
          ];
        });
      } catch {
        /* freeze */
      }
    });
  }

  function scheduleAutosave(nextBoxes: BoxInputs) {
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (!obligation || !vatIdsReady) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistBoxesNow(nextBoxes);
    }, 600);
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const sortedPeriods = useMemo(
    () => [...periodList].sort((a, b) => a.start.localeCompare(b.start)),
    [periodList],
  );

  const visiblePeriods = useMemo(
    () => sliceVatPeriodWindow(sortedPeriods, windowStart),
    [sortedPeriods, windowStart],
  );

  const hasEarlierQuarters = windowStart > 0;
  const hasLaterQuarters =
    windowStart + VAT_PERIOD_WINDOW_SIZE < sortedPeriods.length;
  const latestStart = latestVatPeriodWindowStart(sortedPeriods.length);

  function prettyRegDate(iso: string | null | undefined) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    return prettyDate(iso);
  }

  function periodTitle(o: { periodKey: string; start: string; end: string }) {
    return formatVatPeriodLabel(o.start, o.end);
  }

  function returnPeriodLabel(r: ReturnRow): string {
    if (
      r.periodStart &&
      r.periodEnd &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.periodStart) &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.periodEnd)
    ) {
      return formatVatPeriodLabel(r.periodStart, r.periodEnd);
    }
    const match =
      periodList.find((p) => p.periodKey === r.periodKey) ??
      obligations.find((p) => p.periodKey === r.periodKey);
    if (match) return formatVatPeriodLabel(match.start, match.end);
    return r.periodKey;
  }

  function periodHasSubmittedReturn(o: Obligation): boolean {
    return returnRows.some((r) => {
      if (!isFiledVatReturn(r.status)) return false;
      if (r.periodKey === o.periodKey) return true;
      return (
        r.periodStart === o.start && r.periodEnd === o.end
      );
    });
  }

  function canDeletePeriod(o: Obligation): boolean {
    if (periodHasSubmittedReturn(o)) return false;
    if (connected && !isOpenObligation(o.status)) return false;
    return true;
  }

  function deletePeriod(o: Obligation) {
    if (!canDeletePeriod(o)) return;
    userCustomPeriodsRef.current = true;
    const next = periodList.filter(
      (p) =>
        !(
          p.periodKey === o.periodKey &&
          p.start === o.start &&
          p.end === o.end
        ),
    );
    setPeriodList(next);
    setHmrcPeriods(false);
    setReturnRows((prev) =>
      prev.filter((r) => {
        if (isFiledVatReturn(r.status)) return true;
        const sameKey = r.periodKey === o.periodKey;
        const sameDates =
          r.periodStart === o.start && r.periodEnd === o.end;
        return !sameKey && !sameDates;
      }),
    );
    if (
      selected === o.periodKey ||
      (obligation?.start === o.start && obligation?.end === o.end)
    ) {
      setSelected(next[0]?.periodKey ?? "");
    }
    setWindowStart(latestVatPeriodWindowStart(next.length));
  }

  function applySeededPeriods(
    seeded: ReturnType<typeof periodsFromRegistrationDate>,
  ) {
    if (!seeded.length) return false;
    const next = seeded.map((p) => ({
      periodKey: p.periodKey,
      start: p.start,
      end: p.end,
      due: p.due,
      status: p.status,
    }));
    setPeriodList(next);
    setHmrcPeriods(false);
    setWindowStart(latestVatPeriodWindowStart(next.length));
    setSelected(seeded[0]?.periodKey ?? "");
    return true;
  }

  /** When HMRC is empty / offline, seed quarters from the registration date. */
  function seedFromRegistration() {
    if (!vatRegistrationDate || !hasVatRegDate) return false;
    if (userCustomPeriodsRef.current) return false;
    return applySeededPeriods(
      periodsFromRegistrationDate(
        vatRegistrationDate,
        VAT_PERIOD_WINDOW_SIZE,
      ),
    );
  }

  function appendPeriod(period: {
    periodKey: string;
    start: string;
    end: string;
    due: string;
    status: string;
  }) {
    userCustomPeriodsRef.current = true;
    const next = [...periodList, period];
    setPeriodList(next);
    setHmrcPeriods(false);
    setWindowStart(latestVatPeriodWindowStart(next.length));
    setSelected(period.periodKey);
  }

  function addNextQuarter() {
    if (!hasVatRegDate) return;
    const sorted = [...periodList].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    if (sorted.length === 0) {
      const seeded = periodsFromRegistrationDate(vatRegistrationDate!, 1);
      const first = seeded[0];
      if (!first) return;
      appendPeriod({
        periodKey: first.periodKey,
        start: first.start,
        end: first.end,
        due: first.due,
        status: first.status,
      });
      return;
    }
    const last = sorted[sorted.length - 1]!;
    // Continue the same stagger as the last quarter (custom or seeded).
    const nextPeriod = nextVatPeriodAfter(last.end, last.start);
    if (
      sorted.some(
        (p) => p.start === nextPeriod.start && p.end === nextPeriod.end,
      )
    ) {
      return;
    }
    appendPeriod({
      periodKey: nextPeriod.periodKey,
      start: nextPeriod.start,
      end: nextPeriod.end,
      due: nextPeriod.due,
      status: "O",
    });
  }

  function addCustomQuarter() {
    if (!hasVatRegDate || !vatRegistrationDate) return;
    const start = customStart.slice(0, 10);
    const end = customEnd.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return;
    }
    if (end < start) return;
    if (start < vatRegistrationDate) return;
    if (
      periodList.some((p) => p.start === start && p.end === end)
    ) {
      return;
    }
    const period = makeVatPeriod(start, end);
    appendPeriod({
      periodKey: period.periodKey,
      start: period.start,
      end: period.end,
      due: period.due,
      status: "O",
    });
    setCustomStart("");
    setCustomEnd("");
  }

  const customQuarterReady =
    hasVatRegDate &&
    Boolean(vatRegistrationDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(customStart) &&
    /^\d{4}-\d{2}-\d{2}$/.test(customEnd) &&
    customEnd >= customStart &&
    customStart >= (vatRegistrationDate ?? "");

  useEffect(() => {
    warmFraudHeaders();
  }, []);

  // Once VRN + registration date exist (and HMRC is not driving the list),
  // auto-seed the registration quarter + next quarters so the desk is never empty.
  useEffect(() => {
    if (!vatIdsReady || !vatRegistrationDate) return;
    if (hmrcPeriods || userCustomPeriodsRef.current) return;
    if (connected) {
      // Connected: wait for HMRC refresh; only clamp SSR placeholders meanwhile.
      const clamped = clampPeriodsToRegistration(
        periodList,
        vatRegistrationDate,
      );
      if (clamped.length === 0) return;
      const changed =
        clamped.length !== periodList.length ||
        clamped.some(
          (p, i) =>
            p.start !== periodList[i]?.start || p.end !== periodList[i]?.end,
        );
      if (changed) {
        setPeriodList(clamped);
        setWindowStart(latestVatPeriodWindowStart(clamped.length));
        const stillSelected = clamped.some((p) => p.periodKey === selected);
        if (!stillSelected) {
          const open =
            clamped.find((o) => isOpenObligation(o.status)) ?? clamped[0];
          if (open) setSelected(open.periodKey);
        }
      }
      return;
    }
    // Re-seed when empty, or when the old calendar-quarter stub remains
    // (e.g. 1 Mar–31 Mar after mid-quarter registration).
    const first = [...periodList].sort((a, b) =>
      a.start.localeCompare(b.start),
    )[0];
    const stubDays =
      first &&
      (Date.parse(`${first.end}T12:00:00Z`) -
        Date.parse(`${first.start}T12:00:00Z`)) /
        86_400_000;
    const looksLikeOldCalendarStub =
      typeof stubDays === "number" &&
      stubDays < 60 &&
      /-(03-31|06-30|09-30|12-31)$/.test(first!.end);
    if (periodList.length === 0 || looksLikeOldCalendarStub) {
      seedFromRegistration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatIdsReady, vatRegistrationDate, connected]);

  useEffect(() => {
    if (!connected || !vatIdsReady) return;
    let cancelled = false;
    start(async () => {
      try {
        const live = await refreshVatObligationsFromHmrc({
          clientId,
          fraudMetadata: gatherFraudMetadata(),
        });
        if (cancelled) return;
        if (live.length === 0) {
          // HMRC returned nothing — still offer auto quarters.
          seedFromRegistration();
          return;
        }
        const clamped = clampPeriodsToRegistration(live, vatRegistrationDate);
        if (!clamped.length) {
          seedFromRegistration();
          return;
        }
        userCustomPeriodsRef.current = false;
        setPeriodList(clamped);
        setHmrcPeriods(true);
        setWindowStart(latestVatPeriodWindowStart(clamped.length));
        const open =
          clamped.find((o) => isOpenObligation(o.status)) ?? clamped[0];
        if (open) setSelected(open.periodKey);
      } catch {
        // Desk UI: freeze — keep any custom / seeded periods; seed if empty.
        if (!cancelled && periodList.length === 0) {
          seedFromRegistration();
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // Intentional: refresh once when connection becomes available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, clientId, vatIdsReady, vatRegistrationDate]);

  const derived = useMemo(() => {
    const b1 = parsePounds(boxes.vatDueSales);
    const b2 = parsePounds(boxes.vatDueAcquisitions);
    const b4 = parsePounds(boxes.vatReclaimedCurrPeriod);
    const total = b1 + b2;
    const net = Math.abs(total - b4);
    return {
      totalVatDue: penceToField(total),
      netVatDue: penceToField(net),
      pence: {
        vatDueSales: pence(b1),
        vatDueAcquisitions: pence(b2),
        totalVatDue: pence(total),
        vatReclaimedCurrPeriod: pence(b4),
        netVatDue: pence(net),
        totalValueSalesExVAT: pence(parsePounds(boxes.totalValueSalesExVAT)),
        totalValuePurchasesExVAT: pence(
          parsePounds(boxes.totalValuePurchasesExVAT),
        ),
        totalValueGoodsSuppliedExVAT: pence(
          parsePounds(boxes.totalValueGoodsSuppliedExVAT),
        ),
        totalAcquisitionsExVAT: pence(
          parsePounds(boxes.totalAcquisitionsExVAT),
        ),
      },
    };
  }, [boxes]);

  function setBox(key: BoxKey, value: string) {
    if (COMPUTED.includes(key)) return;
    setBoxes((prev) => {
      const next = { ...prev, [key]: value };
      scheduleAutosave(next);
      return next;
    });
  }

  function confirmPullStatements(selected: BankStatementDocSummary[]) {
    const period = pullPeriod ?? obligation;
    if (!period || !vatIdsReady || selected.length === 0) return;
    setPullOpen(false);
    start(async () => {
      setError(null);
      try {
        // Pull statements into the ledger / period view — boxes filled separately.
        await pullVatBoxesFromBooks({
          clientId,
          periodStart: period.start,
          periodEnd: period.end,
          documentIds: selected.map((d) => d.id),
        });
        setMessage(
          `Transactions pulled for ${period.title ?? period.periodKey}. Allocate heads, then fill boxes from the transactions card.`,
        );
        router.refresh();
        openPeriodTransactionsCard(period);
      } catch {
        /* freeze */
      } finally {
        setPullPeriod(null);
      }
    });
  }

  function openPeriodTransactionsCard(
    period: { periodKey: string; start: string },
    highlightCategory?: string,
  ) {
    requestAnimationFrame(() => {
      const id = `vat-categorised-${period.periodKey}-${period.start}`;
      const el = document.getElementById(id);
      if (!el) return;
      const details = el.closest("details");
      if (details && !details.open) details.open = true;
      const head =
        highlightCategory != null
          ? el.querySelector(
              `[data-vat-head="${CSS.escape(highlightCategory)}"]`,
            )
          : null;
      const target = head instanceof HTMLElement ? head : el;
      if (head instanceof HTMLElement) {
        const expandBtn = head.querySelector(
          'button[aria-expanded="false"]',
        );
        if (expandBtn instanceof HTMLElement) expandBtn.click();
      }
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function fillBoxesFromTransactionsCard() {
    if (!obligation || !vatIdsReady) return;
    const periodLines = txsForPeriod(
      bankTransactions,
      {
        periodKey: obligation.periodKey,
        start: obligation.start,
        end: obligation.end,
      },
      vatRegistrationDate,
    );
    const needing = categoriesNeedingVatAllocate(
      periodLines.map((t) => t.category),
      vatAllocateByCategory,
    );
    if (periodLines.length > 0 && needing.length > 0) {
      setMessage(
        "Allocate each transaction head to a VAT box, then fill boxes from the transactions card.",
      );
      openPeriodTransactionsCard(obligation, needing[0]);
      return;
    }
    start(async () => {
      setError(null);
      try {
        const { treatments, directions } =
          buildVatOverridesFromChoices(vatAllocateByCategory);
        const res = await draftVatBoxesFromBank({
          clientId,
          periodStart: obligation.start,
          periodEnd: obligation.end,
          treatmentOverrides: treatments,
          directionOverrides: directions,
        });
        if (!res.ok || !res.boxes) return;
        const filled = boxesFromRollup(res.boxes);
        setBoxes(filled);
        skipNextAutosaveRef.current = false;
        persistBoxesNow(filled);
        setMessage(
          `VAT boxes filled from transactions card · ${res.periodLines} line${res.periodLines === 1 ? "" : "s"}`,
        );
      } catch {
        /* freeze */
      }
    });
  }

  function renderPeriodList() {
    return (
      <ul className="mt-3 space-y-2">
        {visiblePeriods.map((o) => {
          const active =
            o.periodKey === selected ||
            (obligation?.start === o.start && obligation?.end === o.end);
          const deletable = canDeletePeriod(o);
          return (
            <li key={`${o.periodKey}-${o.start}-${o.end}`} className="relative">
              <button
                type="button"
                onClick={() => {
                  setSelected(o.periodKey);
                  setMessage(null);
                  setError(null);
                }}
                className={`w-full min-w-0 rounded-xl border px-3.5 py-3 pr-9 text-left text-sm transition ${
                  active
                    ? "border-sea bg-sea/5"
                    : "border-line hover:border-sea/40"
                }`}
              >
                <span className="font-semibold text-ink">
                  {periodTitle(o)}
                </span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  {prettyDate(o.start)} – {prettyDate(o.end)}
                </span>
                {connected ? (
                  <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-sea">
                    {isOpenObligation(o.status) ? "Open" : "Fulfilled"}
                  </span>
                ) : null}
                {!deletable && periodHasSubmittedReturn(o) ? (
                  <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                    Submitted
                  </span>
                ) : null}
              </button>
              {deletable ? (
                <button
                  type="button"
                  aria-label={`Remove ${periodTitle(o)}`}
                  className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-sm font-bold leading-none text-ink-soft transition hover:bg-line/60 hover:text-ink"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePeriod(o);
                  }}
                >
                  ×
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          {clientName}
        </p>
        <h1 className="display mt-1 inline-flex flex-wrap items-center gap-2 text-4xl text-ink md:text-5xl">
          <span className="inline-flex items-center gap-1.5">
            VAT
            <AbbrInfo code="VAT" />
          </span>
          Returns
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-ink-soft">
          File
          <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
            MTD
            <AbbrInfo code="MTD" />
          </span>
          VAT to HMRC
          {vrn ? (
            <>
              {" · "}
              <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
                VRN
                <AbbrInfo code="VRN" />
              </span>{" "}
              {vrn}
            </>
          ) : (
            <>
              {" · "}
              <span className="inline-flex items-center gap-0.5 font-semibold text-ink">
                VRN
                <AbbrInfo code="VRN" />
              </span>{" "}
              required
            </>
          )}
          {hasVatRegDate
            ? ` · registered ${prettyRegDate(vatRegistrationDate)}`
            : " · registration date required"}
          {connected ? " · connected" : ""}
        </p>
        {!vatIdsReady ? (
          <p className="mt-2 text-sm text-ink-soft">
            Add the VRN and VAT registration date on the{" "}
            <Link
              href={`/clients/${clientId}/edit`}
              className="font-semibold text-sea underline-offset-2 hover:underline"
            >
              client record
            </Link>{" "}
            (or when connecting to HMRC) before drafting or submitting.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-stretch lg:gap-6">
        <aside className="flex min-h-0 min-w-0 flex-col gap-4">
          <div className="panel w-full shrink-0 p-4">
            <h2 className="inline-flex items-center gap-1 text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
              VAT periods
              <AbbrInfo code="VAT" />
            </h2>

            {hasEarlierQuarters ? (
              <button
                type="button"
                className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-left text-xs font-semibold text-sea transition hover:border-sea/40"
                onClick={() =>
                  setWindowStart((s) =>
                    Math.max(0, s - VAT_PERIOD_WINDOW_SIZE),
                  )
                }
              >
                See previous quarters
              </button>
            ) : null}

            {connected && vatIdsReady ? (
              <>
                {!hmrcPeriods && periodList.length === 0 ? (
                  <p className="mt-3 text-xs text-ink-soft">
                    Loading periods from HMRC…
                  </p>
                ) : null}
                {renderPeriodList()}
                {vatIdsReady && periodList.length === 0 ? (
                  <p className="mt-3 text-xs text-ink-soft">
                    No HMRC periods yet — add a quarter below, or we can seed
                    from the registration date.
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost mt-3 w-full text-xs"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      try {
                        const live = await refreshVatObligationsFromHmrc({
                          clientId,
                          fraudMetadata: gatherFraudMetadata(),
                        });
                        if (!live.length) {
                          seedFromRegistration();
                          return;
                        }
                        const clamped = clampPeriodsToRegistration(
                          live,
                          vatRegistrationDate,
                        );
                        if (!clamped.length) {
                          seedFromRegistration();
                          return;
                        }
                        setPeriodList(clamped);
                        setHmrcPeriods(true);
                        setWindowStart(
                          latestVatPeriodWindowStart(clamped.length),
                        );
                        setMessage("VAT periods refreshed from HMRC");
                      } catch {
                        // Freeze
                      }
                    })
                  }
                >
                  Refresh from HMRC
                </button>
              </>
            ) : (
              renderPeriodList()
            )}

            {hasLaterQuarters ? (
              <button
                type="button"
                className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-left text-xs font-semibold text-sea transition hover:border-sea/40"
                onClick={() => setWindowStart(latestStart)}
              >
                Back to current quarters
              </button>
            ) : null}

            <div className="mt-4 space-y-3 border-t border-line pt-3">
              <button
                type="button"
                className="btn btn-secondary w-full text-xs"
                disabled={!hasVatRegDate}
                onClick={addNextQuarter}
              >
                Add Quarter
              </button>

              <div className="space-y-2 rounded-lg border border-line bg-paper/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  Custom quarter
                </p>
                <label className="block text-[11px] text-ink-soft">
                  Start
                  <UkDateField
                    className="input mt-1 w-full text-xs"
                    value={customStart}
                    disabled={!hasVatRegDate}
                    onChange={(iso) => setCustomStart(iso)}
                  />
                </label>
                <label className="block text-[11px] text-ink-soft">
                  End
                  <UkDateField
                    className="input mt-1 w-full text-xs"
                    value={customEnd}
                    disabled={!hasVatRegDate}
                    onChange={(iso) => setCustomEnd(iso)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary w-full text-xs"
                  disabled={!customQuarterReady}
                  onClick={addCustomQuarter}
                >
                  Add custom dates
                </button>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 w-full flex-1 flex-col">
            <VatBooksBankPanel
              clientId={clientId}
              clientSlug={clientSlug}
              bankStatements={bankStatements}
              allowUpload
              fillHeight
            />
          </div>

          {filedReturns.length > 0 ? (
            <div className="panel w-full shrink-0 p-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                Submitted
              </h2>
              <ul className="mt-2 divide-y divide-line text-sm">
                {filedReturns.map((r) => {
                  const label = returnPeriodLabel(r);
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-1.5"
                    >
                      <span className="font-semibold">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="badge badge-ok">
                          {r.status.toLowerCase() === "accepted"
                            ? "Accepted"
                            : "Submitted"}
                        </span>
                        <EmailToClientButton
                          clientId={clientId}
                          defaultEmail={contactEmail}
                          compact
                          label="Email"
                          subject={`VAT return ${label} — ${clientName}`}
                          message={`Please find a summary of the submitted VAT return for ${label}.\n\nKind regards`}
                          artifact={{
                            type: "vat_summary",
                            periodKey: r.periodKey,
                            status: "submitted",
                            boxes: r.boxes ?? undefined,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </aside>

        {/* Main filing card — stretches to match left column bottom */}
        <section className="flex min-h-0 min-w-0 flex-col">
          <div className="panel flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="display text-2xl text-ink">
                  File next VAT return to HMRC
                </h2>
                {obligation && (
                  <p className="mt-1 text-sm text-ink-soft">
                    {periodTitle(obligation)}: {prettyDate(obligation.start)} –{" "}
                    {prettyDate(obligation.end)} · due{" "}
                    {prettyDate(obligation.due)}
                  </p>
                )}
              </div>
              {connected ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-ok">HMRC connected</span>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await disconnectHmrcAction(clientId);
                        router.refresh();
                      })
                    }
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <span className="badge badge-muted">HMRC not connected</span>
              )}
            </div>

            <div className="flex flex-1 flex-col p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                    Create digital record
                  </h3>
                  {obligation ? (
                    <p className="mt-1 text-xs text-ink-soft">
                      {formatPeriodRange(obligation.start, obligation.end)}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    disabled={
                      pending ||
                      !obligation ||
                      !vatIdsReady ||
                      bankTransactionCount <= 0
                    }
                    onClick={() => fillBoxesFromTransactionsCard()}
                  >
                    {pending
                      ? "Filling…"
                      : "Fill boxes from transactions card"}
                  </button>
                  <MtdFileUploadButton
                    disabled={pending || !obligation || !vatIdsReady}
                    onFile={async (file) => {
                      if (!obligation || !vatIdsReady) return;
                      setError(null);
                      const parsed = await parseMtdVatFile(file);
                      if (!parsed.ok) return;
                      const filled: BoxInputs = {
                        ...EMPTY_BOXES,
                        vatDueSales: penceToField(
                          Math.round(parsed.boxes.vatDueSales * 100),
                        ),
                        vatDueAcquisitions: penceToField(
                          Math.round(parsed.boxes.vatDueAcquisitions * 100),
                        ),
                        totalVatDue: penceToField(
                          Math.round(parsed.boxes.totalVatDue * 100),
                        ),
                        vatReclaimedCurrPeriod: penceToField(
                          Math.round(
                            parsed.boxes.vatReclaimedCurrPeriod * 100,
                          ),
                        ),
                        netVatDue: penceToField(
                          Math.round(parsed.boxes.netVatDue * 100),
                        ),
                        totalValueSalesExVAT: penceToField(
                          Math.round(parsed.boxes.totalValueSalesExVAT * 100),
                        ),
                        totalValuePurchasesExVAT: penceToField(
                          Math.round(
                            parsed.boxes.totalValuePurchasesExVAT * 100,
                          ),
                        ),
                        totalValueGoodsSuppliedExVAT: penceToField(
                          Math.round(
                            parsed.boxes.totalValueGoodsSuppliedExVAT * 100,
                          ),
                        ),
                        totalAcquisitionsExVAT: penceToField(
                          Math.round(
                            parsed.boxes.totalAcquisitionsExVAT * 100,
                          ),
                        ),
                      };
                      setBoxes(filled);
                      skipNextAutosaveRef.current = false;
                      persistBoxesNow(filled);
                      setMessage(
                        `VAT boxes filled from MTD file · ${parsed.filledCount} figure${parsed.filledCount === 1 ? "" : "s"}`,
                      );
                    }}
                  />
                </div>
              </div>
              <ul className="mt-4 flex min-h-0 w-full flex-1 flex-col gap-2">
                {VAT_BOX_DEFINITIONS.map((def) => {
                  const computed = COMPUTED.includes(def.key);
                  const value = computed
                    ? derived[def.key as "totalVatDue" | "netVatDue"]
                    : boxes[def.key];
                  const infoCode = `VAT${def.id}` as const;
                  return (
                    <li
                      key={def.key}
                      className={`grid min-h-[3.25rem] flex-1 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2.5 py-2.5 sm:min-h-[3.5rem] ${
                        computed ? "bg-sea/5" : ""
                      }`}
                    >
                      <span className="flex size-9 items-center justify-center rounded-full bg-sea text-sm font-bold text-white">
                        {def.id}
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-sm leading-snug text-ink sm:text-[0.95rem]">
                        <span className="min-w-0">{BOX_SHORT[def.key]}</span>
                        <AbbrInfo code={infoCode} force className="shrink-0" />
                      </span>
                      <input
                        className={`input mono figures !h-11 !min-h-0 !w-[9.25rem] shrink-0 py-2.5 text-right text-sm tabular-nums ${
                          computed ? "font-semibold" : ""
                        }`}
                        inputMode="decimal"
                        readOnly={computed}
                        disabled={!vatIdsReady}
                        value={value}
                        placeholder="0.00"
                        onFocus={(e) => {
                          if (computed) return;
                          const raw = String(value ?? "")
                            .replace(/[£,\s]/g, "")
                            .trim();
                          // Clear zero placeholders so the accountant can type straight away.
                          if (!raw || Number.parseFloat(raw) === 0) {
                            setBox(def.key, "");
                            return;
                          }
                          e.currentTarget.select();
                        }}
                        onChange={(e) => setBox(def.key, e.target.value)}
                        onBlur={() => {
                          if (computed) return;
                          const formatted = formatAccountingField(
                            boxes[def.key] ?? "",
                          );
                          if (formatted !== boxes[def.key]) {
                            setBox(def.key, formatted);
                          }
                        }}
                        aria-label={`Box ${def.id}`}
                      />
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 shrink-0 text-sm text-ink-soft">
                Net VAT due:{" "}
                <span className="mono font-semibold text-ink">
                  {money(derived.pence.netVatDue)}
                </span>
              </p>
            </div>

            <div className="mt-auto space-y-3 border-t border-line bg-sand/30 px-5 py-4">
              <FormErrorBanner error={error} />
              <TrialSubmitConfirmPanel
                gateError={trialGate.gateError}
                needsConfirm={trialGate.needsConfirm}
                paymentFailed={trialGate.paymentFailed}
                pending={trialGate.pending || pending}
                onDismiss={() => trialGate.clearGate()}
                onConfirm={() => {
                  if (!obligation || !vatIdsReady) return;
                  trialGate.endTrialThen(async ({ confirmEndTrial }) => {
                    try {
                      await prepareVatReturnFromBoxes({
                        clientId,
                        periodKey: obligation.periodKey,
                        periodStart: obligation.start,
                        periodEnd: obligation.end,
                        boxes: derived.pence,
                      });
                      const fraudMetadata = gatherFraudMetadata();
                      const res = await submitPreparedVatReturn({
                        clientId,
                        periodKey: obligation.periodKey,
                        periodStart: obligation.start,
                        periodEnd: obligation.end,
                        fraudMetadata,
                        confirmEndTrial,
                      });
                      const bundle =
                        (res as { hmrcFormBundleNumber?: string })
                          .hmrcFormBundleNumber ??
                        (res as { result?: { hmrcFormBundleNumber?: string } })
                          .result?.hmrcFormBundleNumber ??
                        "accepted";
                      setHmrcNotice(null);
                      setMessage(`Submitted to HMRC · ${bundle}`);
                      router.refresh();
                    } catch (err) {
                      if (!trialGate.captureSubmitError(err)) {
                        setMessage(null);
                        setHmrcNotice({
                          text: humanizeHmrcFailure(
                            err instanceof Error ? err.message : null,
                          ),
                          ok: false,
                        });
                      }
                    }
                  });
                }}
              />
              {hmrcNotice ? (
                <p
                  role="status"
                  className={`text-sm font-semibold ${
                    hmrcNotice.ok ? "text-ok" : "text-ink"
                  }`}
                >
                  {hmrcNotice.text}
                </p>
              ) : null}
              {message && (
                <p className="text-sm font-semibold text-ok">{message}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {!vatIdsReady ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setConnectOpen(true)}
                  >
                    Enter VRN, registration date & connect
                  </button>
                ) : !connected ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setConnectOpen(true)}
                  >
                    Connect to HMRC to submit
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      pending ||
                      trialGate.pending ||
                      !obligation
                    }
                    onClick={() =>
                      start(async () => {
                        if (!obligation || !vatIdsReady) return;
                        setError(null);
                        trialGate.clearGate();
                        try {
                          await prepareVatReturnFromBoxes({
                            clientId,
                            periodKey: obligation.periodKey,
                            periodStart: obligation.start,
                            periodEnd: obligation.end,
                            boxes: derived.pence,
                          });
                          const fraudMetadata = gatherFraudMetadata();
                          const res = await submitPreparedVatReturn({
                            clientId,
                            periodKey: obligation.periodKey,
                            periodStart: obligation.start,
                            periodEnd: obligation.end,
                            fraudMetadata,
                          });
                          const bundle =
                            (res as { hmrcFormBundleNumber?: string })
                              .hmrcFormBundleNumber ??
                            (res as {
                              result?: { hmrcFormBundleNumber?: string };
                            }).result?.hmrcFormBundleNumber ??
                            "accepted";
                          setMessage(`Submitted to HMRC · ${bundle}`);
                          router.refresh();
                        } catch (err) {
                          if (!trialGate.captureSubmitError(err)) {
                            setMessage(null);
                            setHmrcNotice({
                              text: humanizeHmrcFailure(
                                err instanceof Error ? err.message : null,
                              ),
                              ok: false,
                            });
                          }
                        }
                      })
                    }
                  >
                    {pending ? "Submitting…" : "Submit VAT return to HMRC"}
                  </button>
                )}
                {obligation ? (
                  <EmailToClientButton
                    clientId={clientId}
                    defaultEmail={contactEmail}
                    label="Email draft to client"
                    subject={`Draft VAT return ${periodTitle(obligation)} — ${clientName}`}
                    message={`Please review this draft VAT return for ${periodTitle(obligation)} before we submit to HMRC.\n\nKind regards`}
                    artifact={{
                      type: "vat_summary",
                      periodKey: obligation.periodKey,
                      status: "draft",
                      boxes: Object.fromEntries(
                        Object.entries(boxes).map(([k, v]) => [k, String(v)]),
                      ),
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>

      <VatQuarterBreakdowns
        clientId={clientId}
        visiblePeriods={visiblePeriods.map((p) => ({
          periodKey: p.periodKey,
          start: p.start,
          end: p.end,
          title: periodTitle(p),
        }))}
        transactions={bankTransactions}
        customCategories={customCategories}
        vatRegistrationDate={vatRegistrationDate}
        hasEarlierQuarters={hasEarlierQuarters}
        hasLaterQuarters={hasLaterQuarters}
        onSeePrevious={() =>
          setWindowStart((s) => Math.max(0, s - VAT_PERIOD_WINDOW_SIZE))
        }
        onBackToCurrent={() => setWindowStart(latestStart)}
        canPull={vatIdsReady && bankStatements.length > 0}
        pullPending={pending}
        onPullFromBank={(period) => {
          setPullPeriod(period);
          setSelected(period.periodKey);
          setPullOpen(true);
        }}
        vatAllocateByCategory={vatAllocateByCategory}
        onVatAllocateChange={(category, choice) =>
          setVatAllocateByCategory((prev) => ({
            ...prev,
            [category]: choice,
          }))
        }
      />

      <VatPullStatementsDialog
        open={pullOpen}
        statements={bankStatements}
        periodLabel={
          pullPeriod
            ? `${pullPeriod.title ?? pullPeriod.periodKey} · ${formatPeriodRange(pullPeriod.start, pullPeriod.end)}`
            : obligation
              ? `${periodTitle(obligation)} · ${formatPeriodRange(obligation.start, obligation.end)}`
              : "Select a period"
        }
        pending={pending}
        onCancel={() => {
          setPullOpen(false);
          setPullPeriod(null);
        }}
        onConfirm={confirmPullStatements}
      />

      <HmrcVatConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        clientId={clientId}
        initialVrn={vrn}
        initialVatRegistrationDate={vatRegistrationDate}
        signedIn={signedIn}
      />
    </div>
  );
}

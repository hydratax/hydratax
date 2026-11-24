"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  formatPeriodRange,
  formatVatPeriodLabel,
  isInPeriod,
} from "@/lib/vat-periods";
import {
  BANK_STATEMENT_DESK_LABEL,
  groupBankStatementsByDesk,
  type BankStatementDocSummary,
} from "@/lib/bank/statement-docs";
import type { CustomCategoryRow } from "@/server/actions/custom-categories";
import { BankCategorisedView } from "@/components/forms/bank-categorised-view";
import { extractStatementInBrowser } from "@/lib/bank/extract-statement-browser";
import {
  convertBankStatementText,
  importBankConvertedLines,
  previewBankStatementLines,
} from "@/server/actions/bank";
import { uploadClientDocument } from "@/server/actions/documents";
import {
  bankKey,
  extractBankNameFromFilename,
} from "@/lib/bank/bank-tx-meta";

type Period = {
  periodKey: string;
  start: string;
  end: string;
  title?: string;
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

/** Keep the VAT sidebar short so it aligns with the filing card. */
const PREVIEW_STATEMENT_COUNT = 3;

function canOpenDoc(url: string) {
  return (
    url.startsWith("http") ||
    url.startsWith("/") ||
    url.startsWith("data:")
  );
}

function periodTitle(p: Period) {
  return p.title ?? formatVatPeriodLabel(p.start, p.end);
}

export function txsForPeriod(
  transactions: BankTx[],
  period: Period,
  vatRegistrationDate: string | null | undefined,
): BankTx[] {
  const reg =
    vatRegistrationDate && /^\d{4}-\d{2}-\d{2}$/.test(vatRegistrationDate)
      ? vatRegistrationDate
      : null;
  const effectiveStart = reg && period.start < reg ? reg : period.start;
  return transactions.filter((t) =>
    isInPeriod(t.dated, effectiveStart, period.end),
  );
}

/**
 * Books upload + recent statements under the quarters sidebar.
 * Upload merges into the same books used for CT / VAT.
 */
export function VatBooksBankPanel({
  clientId,
  clientSlug,
  bankStatements = [],
  allowUpload = true,
  fillHeight = false,
}: {
  clientId: string;
  clientSlug?: string;
  bankStatements?: BankStatementDocSummary[];
  allowUpload?: boolean;
  /** Stretch to fill the left column under VAT periods (aligned bottoms). */
  fillHeight?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [bankName, setBankName] = useState("");

  if (!allowUpload) return null;

  function resolvedBank(filename: string) {
    const typed = bankName.trim();
    if (typed) return typed;
    return extractBankNameFromFilename(filename);
  }

  const booksHref = clientSlug
    ? `/clients/${clientSlug}/bank`
    : `/clients/${clientId}/bank`;
  // Prefer VAT-desk uploads on this page, then fall back to other desks.
  const ordered = [...bankStatements].sort((a, b) => {
    const aVat = a.desk === "vat" ? 0 : 1;
    const bVat = b.desk === "vat" ? 0 : 1;
    if (aVat !== bVat) return aVat - bVat;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const preview = ordered.slice(0, PREVIEW_STATEMENT_COUNT);
  const moreCount = Math.max(0, bankStatements.length - preview.length);

  function runUpload(file: File) {
    start(async () => {
      try {
        const name = file.name.toLowerCase();
        const isSheet =
          name.endsWith(".xlsx") ||
          name.endsWith(".xls") ||
          file.type.includes("spreadsheet") ||
          file.type.includes("excel");

        // Archive under VAT → bank statement in Books.
        try {
          const fd = new FormData();
          fd.set("clientId", clientId);
          fd.set("category", "vat:bank_statement");
          fd.set("file", file);
          await uploadClientDocument(fd);
        } catch {
          /* storage optional */
        }

        const bank = resolvedBank(file.name);
        if (isSheet) {
          const fd = new FormData();
          fd.set("file", file);
          const sheetPreview = await previewBankStatementLines(fd);
          if (!sheetPreview.ok) return;
          await importBankConvertedLines({
            clientId,
            lines: sheetPreview.lines,
            filename: file.name,
            source:
              sheetPreview.source === "spreadsheet" ? "spreadsheet" : "csv",
            bankName: bank,
            mode: "merge",
          });
        } else {
          const extracted = await extractStatementInBrowser(file);
          const convertSource =
            extracted.method === "csv"
              ? "csv"
              : extracted.method === "ocr"
                ? "ocr"
                : "pdf";
          const converted = await convertBankStatementText({
            text: extracted.text,
            source: convertSource,
          });
          if (!converted.ok) return;
          await importBankConvertedLines({
            clientId,
            lines: converted.lines,
            filename: file.name,
            source: convertSource,
            bankName: bank,
            mode: "merge",
          });
        }
        setFileName(null);
        setBankName("");
        if (fileRef.current) fileRef.current.value = "";
        void bankKey(bank);
        router.refresh();
      } catch {
        /* freeze */
      }
    });
  }

  return (
    <div
      className={`panel flex w-full flex-col gap-3 p-4 ${
        fillHeight ? "h-full min-h-0" : ""
      }`}
    >
      <h3 className="shrink-0 text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
        Books bank data
      </h3>

      <div
        className={`min-h-0 rounded-lg border border-line bg-paper ${
          fillHeight ? "flex-1 overflow-y-auto" : ""
        }`}
      >
        {preview.length > 0 ? (
          <div>
            {groupBankStatementsByDesk(preview).map((group) => (
              <div key={group.desk}>
                <p className="sticky top-0 border-b border-line bg-paper px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                  {group.label}
                </p>
                <ul className="divide-y divide-line">
                  {group.docs.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-start justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-ink">
                          {doc.filename}
                        </p>
                        <p className="mt-0.5 text-[10px] text-ink-soft">
                          {(doc.sizeBytes / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      {canOpenDoc(doc.blobUrl) ? (
                        <a
                          href={doc.blobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs font-semibold text-sea hover:underline"
                          download={doc.filename}
                        >
                          Open
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {moreCount > 0 ? (
              <p className="border-t border-line px-3 py-2 text-[10px] font-semibold text-ink-soft">
                +{moreCount} more in Books
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full min-h-[5.5rem] flex-1 items-center justify-center px-3 py-4 text-center">
            <p className="text-xs leading-snug text-ink-soft">
              No statements yet — upload saves under{" "}
              {BANK_STATEMENT_DESK_LABEL.vat} in Books.
            </p>
          </div>
        )}
      </div>

      <div className="mt-auto shrink-0 space-y-2">
        <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-ink-soft">
          Bank name
          <input
            type="text"
            className="input mt-1 w-full text-xs"
            placeholder="e.g. Tide, Barclays"
            value={bankName}
            disabled={pending}
            onChange={(e) => setBankName(e.target.value)}
          />
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFileName(f?.name ?? null);
            if (f) {
              if (!bankName.trim()) {
                const guessed = extractBankNameFromFilename(f.name);
                if (guessed !== "Unnamed bank") setBankName(guessed);
              }
              runUpload(f);
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary w-full text-xs"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          {pending
            ? "Uploading…"
            : fileName
              ? `Uploading ${fileName}…`
              : "Upload statement"}
        </button>
        <Link href={booksHref} className="btn btn-ghost w-full text-xs">
          Open Books
        </Link>
      </div>
    </div>
  );
}

/**
 * One collapsible breakdown card per visible VAT quarter — window controls
 * stay in sync with the periods sidebar. New cards appear when a quarter is
 * added in the VAT periods panel (no Add Quarter here).
 */
export function VatQuarterBreakdowns({
  clientId,
  visiblePeriods,
  transactions,
  customCategories = [],
  vatRegistrationDate = null,
  hasEarlierQuarters,
  hasLaterQuarters,
  onSeePrevious,
  onBackToCurrent,
  onPullFromBank,
  vatAllocateByCategory,
  onVatAllocateChange,
  canPull = true,
  pullPending = false,
}: {
  clientId: string;
  visiblePeriods: Period[];
  transactions: BankTx[];
  customCategories?: CustomCategoryRow[];
  vatRegistrationDate?: string | null;
  hasEarlierQuarters: boolean;
  hasLaterQuarters: boolean;
  onSeePrevious: () => void;
  onBackToCurrent: () => void;
  onPullFromBank: (period: Period) => void;
  vatAllocateByCategory?: Record<string, import("@/lib/vat-box-allocate").VatAllocateChoice>;
  onVatAllocateChange?: (
    category: string,
    choice: import("@/lib/vat-box-allocate").VatAllocateChoice,
  ) => void;
  canPull?: boolean;
  pullPending?: boolean;
}) {
  if (visiblePeriods.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
            Transaction breakdown
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            One card per visible quarter — pull bank lines, allocate heads to
            VAT boxes, then fill the return above.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasEarlierQuarters ? (
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={onSeePrevious}
            >
              See previous quarters
            </button>
          ) : null}
          {hasLaterQuarters ? (
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={onBackToCurrent}
            >
              Back to current
            </button>
          ) : null}
        </div>
      </div>

      {visiblePeriods.map((period) => {
        const lines = txsForPeriod(
          transactions,
          period,
          vatRegistrationDate,
        );
        const title = periodTitle(period);
        const id = `vat-categorised-${period.periodKey}-${period.start}`;
        return (
          <details
            key={`${period.periodKey}-${period.start}`}
            className="panel overflow-hidden bg-white"
          >
            <summary className="cursor-pointer list-none bg-white px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                    Transaction breakdown
                  </p>
                  <p className="mt-0.5 text-sm text-ink">
                    {title} · {formatPeriodRange(period.start, period.end)} ·{" "}
                    {lines.length} line
                    {lines.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    disabled={!canPull || pullPending}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onPullFromBank(period);
                    }}
                  >
                    {pullPending
                      ? "Pulling…"
                      : "Pull transactions from bank"}
                  </button>
                  <span className="text-xs text-ink-soft" aria-hidden>
                    ▾
                  </span>
                </div>
              </div>
            </summary>
            <div className="border-t border-line bg-white px-2 pb-3 pt-1" id={id}>
              <BankCategorisedView
                clientId={clientId}
                transactions={lines}
                customCategories={customCategories}
                missingDesk="VAT"
                periodStart={period.start}
                periodEnd={period.end}
                vatAllocateByCategory={vatAllocateByCategory}
                onVatAllocateChange={onVatAllocateChange}
                groupByBank
              />
              <p className="mt-2 px-3 text-xs text-ink-soft">
                Range {formatPeriodRange(period.start, period.end)}
              </p>
            </div>
          </details>
        );
      })}
    </div>
  );
}

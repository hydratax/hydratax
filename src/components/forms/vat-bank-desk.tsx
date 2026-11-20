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
};

const PREVIEW_STATEMENT_COUNT = 5;

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

function txsForPeriod(
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
}: {
  clientId: string;
  clientSlug?: string;
  bankStatements?: BankStatementDocSummary[];
  allowUpload?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);

  if (!allowUpload) return null;

  const booksHref = clientSlug
    ? `/clients/${clientSlug}/bank`
    : `/clients/${clientId}/bank`;
  const preview = bankStatements.slice(0, PREVIEW_STATEMENT_COUNT);
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
            mode: "merge",
          });
        }
        setFileName(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch {
        /* freeze */
      }
    });
  }

  return (
    <div className="panel flex w-full flex-col gap-3 p-4">
      <h3 className="shrink-0 text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
        Books bank data
      </h3>

      <div className="rounded-lg border border-line bg-paper">
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
                      className="flex items-start justify-between gap-2 px-3 py-2.5"
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
          <div className="flex h-full min-h-[5.5rem] items-center justify-center px-3 py-4 text-center">
            <p className="text-xs leading-snug text-ink-soft">
              No statements yet — upload saves under{" "}
              {BANK_STATEMENT_DESK_LABEL.vat} in Books.
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFileName(f?.name ?? null);
            if (f) runUpload(f);
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
 * stay in sync with the periods sidebar.
 */
export function VatQuarterBreakdowns({
  clientId,
  visiblePeriods,
  transactions,
  customCategories = [],
  vatRegistrationDate = null,
  hasEarlierQuarters,
  hasLaterQuarters,
  canAddQuarter,
  onSeePrevious,
  onBackToCurrent,
  onAddQuarter,
}: {
  clientId: string;
  visiblePeriods: Period[];
  transactions: BankTx[];
  customCategories?: CustomCategoryRow[];
  vatRegistrationDate?: string | null;
  hasEarlierQuarters: boolean;
  hasLaterQuarters: boolean;
  canAddQuarter: boolean;
  onSeePrevious: () => void;
  onBackToCurrent: () => void;
  onAddQuarter: () => void;
}) {
  if (visiblePeriods.length === 0 && !canAddQuarter) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
            Transaction breakdown
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            One card per visible quarter — reassign heads, then fill boxes from
            books.
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
          {canAddQuarter ? (
            <button
              type="button"
              className="btn btn-secondary text-xs"
              onClick={onAddQuarter}
            >
              Add Quarter
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
            className="panel overflow-hidden"
          >
            <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                    Transaction breakdown
                  </p>
                  <p className="mt-0.5 text-sm text-ink">
                    {title} · {lines.length} line
                    {lines.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-xs text-ink-soft" aria-hidden>
                  ▾
                </span>
              </div>
            </summary>
            <div className="border-t border-line px-2 pb-3 pt-1" id={id}>
              <BankCategorisedView
                clientId={clientId}
                transactions={lines}
                customCategories={customCategories}
                missingDesk="VAT"
                periodStart={period.start}
                periodEnd={period.end}
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

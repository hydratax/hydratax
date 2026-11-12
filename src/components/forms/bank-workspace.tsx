"use client";

import { useRef, useState, useTransition } from "react";
import {
  buildProvisionalHeadsForClient,
  clearBankTransactions,
  convertBankStatementText,
  dedupeBankTransactions,
  importBankConvertedLines,
  importBankCsv,
  requestBankConnect,
  type ConvertedBankLine,
} from "@/server/actions/bank";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";
import { BankCategorisedView } from "@/components/forms/bank-categorised-view";
import { BankYearEndDesk } from "@/components/forms/bank-year-end-desk";
import { recategoriseBankTransactions } from "@/server/actions/bank-recategorise";
import { downloadBankCsv, downloadBankXlsx } from "@/lib/bank-export";
import { extractStatementInBrowser } from "@/lib/bank/extract-statement-browser";
import type { BankLedger, LivePlSummary } from "@/lib/bank-ledger";

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

type StatementDoc = {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

function canOpenDoc(url: string) {
  return (
    url.startsWith("http") ||
    url.startsWith("/") ||
    url.startsWith("data:")
  );
}

export function BankWorkspace({
  clientId,
  clientSlug,
  transactions,
  draft,
  customCategories,
  statements,
  yearEndDesk,
}: {
  clientId: string;
  clientSlug: string;
  transactions: Tx[];
  customCategories: Array<{ id: string; label: string }>;
  statements: StatementDoc[];
  draft: {
    selfAssessment: {
      turnoverPence: number;
      otherIncomePence: number;
      expensesPence: number;
      fromCompanyBank?: boolean;
      directorRemunerationPence?: number;
      dividendPence?: number;
    };
    corporationTax: {
      turnoverPence: number;
      expensesPence: number;
      profitPence: number;
    };
    lineCount: number;
    clientType?: "sole_trader" | "limited_company" | "partnership";
  };
  yearEndDesk?: {
    ledger: BankLedger;
    pl: LivePlSummary;
    periodStart: string;
    periodEnd: string;
  };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ConvertedBankLine[] | null>(null);
  const [previewSource, setPreviewSource] = useState<
    "pdf" | "ocr" | "csv" | "spreadsheet" | null
  >(null);
  const [pending, start] = useTransition();

  function gbp(pence: number) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(pence / 100);
  }

  const hasTransactions = transactions.length > 0;

  function runConvert() {
    setErr(null);
    setMsg(null);
    setPreview(null);
    const file = chosenFile ?? fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      setErr("Choose a bank statement file to convert.");
      return;
    }
    start(async () => {
      try {
        const name = file.name.toLowerCase();
        const isSheet =
          name.endsWith(".xlsx") ||
          name.endsWith(".xls") ||
          file.type.includes("spreadsheet") ||
          file.type.includes("excel");

        // Spreadsheets stay on the server parser (xlsx).
        if (isSheet) {
          const fd = new FormData();
          fd.set("clientId", clientId);
          fd.set("file", file);
          const res = await importBankCsv(fd);
          if (!res.ok) {
            setErr(res.error);
            return;
          }
          setMsg(res.message);
          setChosenFile(null);
          setFileName(null);
          formRef.current?.reset();
          router.refresh();
          document
            .getElementById("categorised-transactions")
            ?.scrollIntoView({ behavior: "smooth" });
          return;
        }

        const extracted = await extractStatementInBrowser(file);
        if (extracted.method === "spreadsheet") {
          setErr("Could not read that spreadsheet. Try CSV export from the bank.");
          return;
        }
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
        if (!converted.ok) {
          setErr(
            extracted.warning
              ? `${converted.error} ${extracted.warning}`
              : converted.error,
          );
          return;
        }
        setPreview(converted.lines);
        setPreviewSource(convertSource);
        setMsg(
          extracted.warning
            ? `${converted.message} ${extracted.warning}`
            : converted.message,
        );
        // Preview mounts after this transition tick — scroll once it's in the DOM.
        setTimeout(() => {
          document
            .getElementById("statement-convert-preview")
            ?.scrollIntoView({ behavior: "smooth" });
        }, 50);
      } catch (error) {
        setErr(messageFromUnknown(error, "Conversion failed"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          ref={formRef}
          className="panel gloss-card space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            runConvert();
          }}
        >
          <h3 className="display text-xl text-ink">Convert bank statement</h3>
          <p className="text-sm text-ink-soft">
            Like an online PDF→CSV converter: extract transactions from CSV,
            Excel, PDF, or a photo. Preview and download CSV first — then save
            to this client’s books if you want them for accounts.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,text/csv,application/pdf,image/png,image/jpeg,image/webp,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setChosenFile(file);
                setFileName(file?.name ?? null);
                setPreview(null);
              }}
            />
            <button
              type="button"
              className="btn btn-secondary px-3 py-1.5 text-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file / photo
            </button>
            <span className="text-sm text-ink-soft">
              {fileName ?? "No file chosen"}
            </span>
          </div>
          <FormErrorBanner error={err} />
          {msg && <p className="text-sm text-ok">{msg}</p>}
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Converting…" : "Convert to transactions"}
          </button>
        </form>

        <div className="panel space-y-3 p-5">
          <h3 className="display text-xl text-ink">Connect bank (Open Banking)</h3>
          <p className="text-sm text-ink-soft">
            With client consent, live feeds can populate the same categorisation
            pipeline used for CSV — then one-click SA / CT drafts.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await requestBankConnect({
                  clientId,
                  provider: "truelayer",
                });
                setMsg(res.message);
              })
            }
          >
            Request TrueLayer connect
          </button>
        </div>
      </div>

      {preview && preview.length > 0 ? (
        <div
          id="statement-convert-preview"
          className="panel space-y-4 border-sea/30 p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="display text-xl text-ink">Converted transactions</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {preview.length} lines ready. Download CSV now, or save into this
                client’s books for categorisation and year-end.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() =>
                  downloadBankCsv(
                    preview,
                    `${(fileName ?? "statement").replace(/\.[^.]+$/, "")}-converted.csv`,
                  )
                }
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() =>
                  downloadBankXlsx(
                    preview,
                    `${(fileName ?? "statement").replace(/\.[^.]+$/, "")}-converted.xlsx`,
                  )
                }
              >
                Download Excel
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    try {
                      const res = await importBankConvertedLines({
                        clientId,
                        lines: preview,
                        filename: fileName ?? undefined,
                        source: previewSource ?? "pdf",
                      });
                      if (!res.ok) {
                        setErr(res.error);
                        return;
                      }
                      setMsg(res.message);
                      setPreview(null);
                      setChosenFile(null);
                      setFileName(null);
                      formRef.current?.reset();
                      router.refresh();
                      document
                        .getElementById("categorised-transactions")
                        ?.scrollIntoView({ behavior: "smooth" });
                    } catch (error) {
                      setErr(
                        messageFromUnknown(error, "Could not save to books"),
                      );
                    }
                  })
                }
              >
                {pending ? "Saving…" : "Save to books"}
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-line">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="sticky top-0 bg-sand/90 text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Description</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 80).map((line, i) => (
                  <tr
                    key={`${line.dated}-${line.description}-${i}`}
                    className="border-t border-line/70"
                  >
                    <td className="mono whitespace-nowrap px-3 py-1.5 text-ink-soft">
                      {line.dated}
                    </td>
                    <td className="px-3 py-1.5 text-ink">{line.description}</td>
                    <td
                      className={`mono whitespace-nowrap px-3 py-1.5 text-right ${
                        line.amountPence < 0 ? "text-danger" : "text-ok"
                      }`}
                    >
                      {gbp(line.amountPence)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 80 ? (
              <p className="border-t border-line px-3 py-2 text-xs text-ink-soft">
                Showing first 80 of {preview.length} — full file in CSV download.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="display text-xl text-ink">Uploaded statements</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Source files saved to the client file. Also listed under{" "}
              <Link
                href={`/clients/${clientSlug}/documents`}
                className="font-semibold text-sea"
              >
                Documents
              </Link>
              .
            </p>
          </div>
          {hasTransactions ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() =>
                  downloadBankCsv(transactions, "bank-categorised.csv")
                }
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() =>
                  downloadBankXlsx(transactions, "bank-categorised.xlsx")
                }
              >
                Download Excel
              </button>
            </div>
          ) : null}
        </div>
        {statements.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">
            No statement files stored yet. After upload, the PDF or spreadsheet
            appears here so you can open or download it.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {statements.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">{doc.filename}</p>
                  <p className="text-xs text-ink-soft">
                    {(doc.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                    {new Date(doc.createdAt).toLocaleString("en-GB")}
                  </p>
                </div>
                {canOpenDoc(doc.blobUrl) ? (
                  <a
                    href={doc.blobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-secondary text-xs"
                    download={doc.filename}
                  >
                    Open / download
                  </a>
                ) : (
                  <span className="badge badge-muted">Stored</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {!hasTransactions && statements.length > 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            Source file saved above. If no lines appeared, re-upload a clearer
            photo/PDF or the bank’s CSV/Excel export.
          </p>
        ) : null}
      </div>

      {hasTransactions ? (
        <div className="panel overflow-hidden border-sea/30 bg-sea/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="display text-xl text-ink">Ready for accounts</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {draft.lineCount} categorised lines — review sections below, then
                use the year-end desk for a live P&amp;L, loans, assets and
                mortgages. Download CSV / Excel above for the converted file.
              </p>
            </div>
            <Link
              href={`/clients/${clientSlug}/accounts-pack`}
              className="btn btn-primary shrink-0"
            >
              Open accounts pack →
            </Link>
          </div>
        </div>
      ) : null}

      {yearEndDesk ? (
        <BankYearEndDesk
          clientId={clientId}
          clientSlug={clientSlug}
          initialLedger={yearEndDesk.ledger}
          initialPl={yearEndDesk.pl}
          periodStart={yearEndDesk.periodStart}
          periodEnd={yearEndDesk.periodEnd}
          transactions={transactions.map((t) => ({
            category: t.category,
            amountPence: t.amountPence,
            dated: t.dated,
          }))}
        />
      ) : null}

      <div className="panel p-5">
        <h3 className="display text-xl text-ink">One-click tax drafts</h3>
        <p className="mt-1 text-sm text-ink-soft">
          From {draft.lineCount} categorised lines (review before HMRC submit).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-sand/40 p-4">
            <p className="text-xs font-bold uppercase text-ink-soft">
              {draft.selfAssessment.fromCompanyBank
                ? "Director SA income (from company bank)"
                : "Self Assessment draft"}
            </p>
            {draft.selfAssessment.fromCompanyBank ? (
              <p className="mt-1 text-xs text-ink-soft">
                Business turnover feeds Corporation Tax only. Tag director pay
                and dividends below for the director&apos;s personal return.
              </p>
            ) : null}
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>
                  {draft.selfAssessment.fromCompanyBank
                    ? "Director remuneration"
                    : "Turnover"}
                </dt>
                <dd className="mono">
                  {gbp(
                    draft.selfAssessment.fromCompanyBank
                      ? (draft.selfAssessment.directorRemunerationPence ?? 0)
                      : draft.selfAssessment.turnoverPence,
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>
                  {draft.selfAssessment.fromCompanyBank
                    ? "Dividends"
                    : "Other income"}
                </dt>
                <dd className="mono">
                  {gbp(
                    draft.selfAssessment.fromCompanyBank
                      ? (draft.selfAssessment.dividendPence ?? 0)
                      : draft.selfAssessment.otherIncomePence,
                  )}
                </dd>
              </div>
              {!draft.selfAssessment.fromCompanyBank ? (
                <div className="flex justify-between">
                  <dt>Expenses</dt>
                  <dd className="mono">
                    {gbp(draft.selfAssessment.expensesPence)}
                  </dd>
                </div>
              ) : null}
            </dl>
            {draft.clientType === "limited_company" ? (
              <p className="mt-3 text-xs text-ink-soft">
                Open the director&apos;s personal client record for the full
                SA100 return.
              </p>
            ) : (
              <Link
                href={`/clients/${clientSlug}/self-assessment`}
                className="btn btn-primary mt-4 text-sm"
              >
                Open Self Assessment
              </Link>
            )}
          </div>
          <div className="rounded-lg border border-line bg-sand/40 p-4">
            <p className="text-xs font-bold uppercase text-ink-soft">
              Corporation Tax draft
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Turnover</dt>
                <dd className="mono">{gbp(draft.corporationTax.turnoverPence)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Expenses</dt>
                <dd className="mono">{gbp(draft.corporationTax.expensesPence)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Profit draft</dt>
                <dd className="mono">{gbp(draft.corporationTax.profitPence)}</dd>
              </div>
            </dl>
            <Link
              href={`/clients/${clientSlug}/corporation-tax`}
              className="btn btn-primary mt-4 text-sm"
            >
              Open CT600
            </Link>
          </div>
        </div>
      </div>

      <div id="categorised-transactions" className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sand/60 px-4 py-3">
          <div>
            <h3 className="font-semibold text-ink">Categorised transactions</h3>
            <p className="text-xs text-ink-soft">
              Grouped by account head — use Move to reallocate (e.g. Esso → fuel).
            </p>
          </div>
          {hasTransactions ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    const res = await dedupeBankTransactions(clientId);
                    if (!res.ok) {
                      setErr(res.error);
                      return;
                    }
                    setMsg(
                      res.removed
                        ? `Removed ${res.removed} duplicate lines.`
                        : "No duplicate lines found.",
                    );
                    router.refresh();
                  })
                }
              >
                Remove duplicates
              </button>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Clear all bank transactions for this client? You can re-import the CSV afterwards.",
                    )
                  ) {
                    return;
                  }
                  start(async () => {
                    setErr(null);
                    const res = await clearBankTransactions(clientId);
                    if (!res.ok) {
                      setErr(res.error);
                      return;
                    }
                    setMsg(`Cleared ${res.removed} lines. Upload your CSV again.`);
                    router.refresh();
                  });
                }}
              >
                Clear all
              </button>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    const res = await recategoriseBankTransactions(clientId);
                    if (!res.ok) {
                      setErr(res.error);
                      return;
                    }
                    setMsg(`Re-applied merchant rules to ${res.updated} lines.`);
                    router.refresh();
                  })
                }
              >
                Re-apply auto rules
              </button>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    const res = await buildProvisionalHeadsForClient(clientId);
                    if (!res.ok) {
                      setErr(res.error);
                      return;
                    }
                    setMsg(res.message);
                    router.refresh();
                  })
                }
              >
                Build review heads
              </button>
            </div>
          ) : null}
        </div>
        <BankCategorisedView
          clientId={clientId}
          transactions={transactions}
          customCategories={customCategories}
        />
      </div>
    </div>
  );
}

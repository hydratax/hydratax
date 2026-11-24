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
import { recategoriseBankTransactions } from "@/server/actions/bank-recategorise";
import { downloadBankCsv, downloadBankXlsx } from "@/lib/bank-export";
import { extractStatementInBrowser } from "@/lib/bank/extract-statement-browser";
import {
  formatMissingMonthsSummary,
  missingBankMonthsByTaxYear,
} from "@/lib/bank/missing-statement-months";
import {
  groupBankStatementsByDesk,
  type BankStatementDocSummary,
} from "@/lib/bank/statement-docs";
import {
  bankKey,
  extractBankNameFromFilename,
} from "@/lib/bank/bank-tx-meta";

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

type StatementDoc = BankStatementDocSummary;

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
}: {
  clientId: string;
  clientSlug: string;
  transactions: Tx[];
  customCategories: Array<{ id: string; label: string }>;
  statements: StatementDoc[];
  /** @deprecated Year-end / CT accounts production lives on the CT desk. */
  clientEmail?: string | null;
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
  const [bankName, setBankName] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [duplicateKeys, setDuplicateKeys] = useState<string[] | null>(null);
  const [openBankKey, setOpenBankKey] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [pending, start] = useTransition();

  function resolvedBankName(filename?: string | null) {
    const typed = bankName.trim();
    if (typed) return typed;
    return extractBankNameFromFilename(filename ?? fileName ?? "statement");
  }

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

        // Spreadsheets stay on the server parser (xlsx) — merge + bank tag.
        if (isSheet) {
          const fd = new FormData();
          fd.set("clientId", clientId);
          fd.set("file", file);
          fd.set("mode", "merge");
          fd.set("bankName", resolvedBankName(file.name));
          const res = await importBankCsv(fd);
          if (!res.ok) {
            setErr(res.error);
            return;
          }
          setMsg(res.message);
          setDuplicateKeys(res.duplicateKeys ?? []);
          setOpenBankKey(bankKey(res.bankName ?? resolvedBankName(file.name)));
          setReassignOpen(true);
          setChosenFile(null);
          setFileName(null);
          formRef.current?.reset();
          router.refresh();
          setTimeout(() => {
            document
              .getElementById(
                (res.duplicateKeys?.length ?? 0) > 0
                  ? "sa-duplicate-transactions"
                  : "ct-reassign-bank-statements",
              )
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 80);
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
        const coverageDates = [
          ...transactions.map((t) => t.dated),
          ...converted.lines.map((l) => l.dated),
        ];
        const missingSummary = formatMissingMonthsSummary(
          missingBankMonthsByTaxYear(coverageDates),
        );
        const baseMsg = extracted.warning
          ? `${converted.message} ${extracted.warning}`
          : converted.message;
        setMsg(
          missingSummary
            ? `${baseMsg} CT · Missing bank statements — ${missingSummary}`
            : baseMsg,
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
          <h3 className="display text-xl text-ink">Convert/Allocate</h3>
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
                if (file && !bankName.trim()) {
                  const guessed = extractBankNameFromFilename(file.name);
                  if (guessed !== "Unnamed bank") setBankName(guessed);
                }
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
          <label className="block text-xs font-semibold text-ink-soft">
            Bank name
            <input
              type="text"
              className="input mt-1 w-full max-w-xs text-sm"
              placeholder="e.g. Tide, Barclays, NatWest"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
            />
          </label>
          <FormErrorBanner error={err} />
          {msg && <p className="text-sm text-ok">{msg}</p>}
          <button
            type="submit"
            disabled={pending || !chosenFile}
            className="btn btn-primary"
          >
            {pending ? "Converting…" : "Convert/Allocate"}
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
              <h3 className="font-semibold text-ink">
                Converted · {resolvedBankName()}
              </h3>
              <p className="mt-0.5 text-xs text-ink-soft">
                {preview.length} lines
                {fileName ? ` · ${fileName}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  aria-expanded={downloadOpen}
                  aria-haspopup="menu"
                  onClick={() => setDownloadOpen((v) => !v)}
                >
                  Download ▾
                </button>
                {downloadOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-md"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-sand/60"
                      onClick={() => {
                        setDownloadOpen(false);
                        downloadBankCsv(
                          preview,
                          `${(fileName ?? "statement").replace(/\.[^.]+$/, "").replace(/\s+/g, "-")}-converted.csv`,
                        );
                      }}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-sand/60"
                      onClick={() => {
                        setDownloadOpen(false);
                        void downloadBankXlsx(
                          preview,
                          `${(fileName ?? "statement").replace(/\.[^.]+$/, "").replace(/\s+/g, "-")}-converted.xlsx`,
                        );
                      }}
                    >
                      Excel
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    try {
                      const bank = resolvedBankName();
                      const res = await importBankConvertedLines({
                        clientId,
                        lines: preview,
                        filename: fileName ?? undefined,
                        source: previewSource ?? "pdf",
                        bankName: bank,
                        mode: "copy_replace",
                      });
                      if (!res.ok) {
                        setErr(res.error);
                        return;
                      }
                      setMsg(res.message);
                      setDuplicateKeys([]);
                      setOpenBankKey(bankKey(res.bankName ?? bank));
                      setReassignOpen(true);
                      setPreview(null);
                      setChosenFile(null);
                      setFileName(null);
                      formRef.current?.reset();
                      router.refresh();
                      setTimeout(() => {
                        document
                          .getElementById("ct-reassign-bank-statements")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }, 80);
                    } catch (error) {
                      setErr(
                        messageFromUnknown(error, "Could not copy and replace"),
                      );
                    }
                  })
                }
              >
                {pending ? "Copying…" : "Copy and Replace"}
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    try {
                      const bank = resolvedBankName();
                      const res = await importBankConvertedLines({
                        clientId,
                        lines: preview,
                        filename: fileName ?? undefined,
                        source: previewSource ?? "pdf",
                        bankName: bank,
                        mode: "merge",
                      });
                      if (!res.ok) {
                        setErr(res.error);
                        return;
                      }
                      setMsg(res.message);
                      setDuplicateKeys(res.duplicateKeys ?? []);
                      setOpenBankKey(bankKey(res.bankName ?? bank));
                      setReassignOpen(true);
                      if ((res.addedCount ?? 0) > 0) {
                        setPreview(null);
                        setChosenFile(null);
                        setFileName(null);
                        formRef.current?.reset();
                      }
                      router.refresh();
                      const hasDups = (res.duplicateKeys?.length ?? 0) > 0;
                      setTimeout(() => {
                        document
                          .getElementById(
                            hasDups
                              ? "sa-duplicate-transactions"
                              : "ct-reassign-bank-statements",
                          )
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }, 80);
                    } catch (error) {
                      setErr(messageFromUnknown(error, "Could not save"));
                    }
                  })
                }
              >
                {pending ? "Saving…" : "SAVE"}
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
              Grouped by Company tax, VAT, and Self Assessment. Also under{" "}
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
                  void downloadBankXlsx(transactions, "bank-categorised.xlsx")
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
          <div className="mt-4 space-y-4">
            {groupBankStatementsByDesk(statements).map((group) => (
              <section key={group.desk}>
                <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
                  {group.label}
                </h4>
                <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                  {group.docs.map((doc) => (
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
              </section>
            ))}
          </div>
        )}
        {!hasTransactions && statements.length > 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            Source file saved above. If no lines appeared, re-upload a clearer
            photo/PDF or the bank’s CSV/Excel export.
          </p>
        ) : null}
      </div>

      <div className="panel p-5">
        <h3 className="display text-xl text-ink">Director SA income</h3>
        <p className="mt-1 text-sm text-ink-soft">
          From {draft.lineCount} categorised company bank lines. Year-end and
          CT accounts production live on Corporation Tax → Accounts Production.
        </p>
        <div className="mt-4 rounded-lg border border-line bg-sand/40 p-4">
          <p className="text-xs font-bold uppercase text-ink-soft">
            {draft.selfAssessment.fromCompanyBank
              ? "Director SA income (from company bank)"
              : "Self Assessment draft"}
          </p>
          {draft.selfAssessment.fromCompanyBank ? (
            <p className="mt-1 text-xs text-ink-soft">
              Business turnover feeds Corporation Tax only. Tag director pay and
              dividends below for the director&apos;s personal return.
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
              Open the director&apos;s personal client record for the full SA100
              return. Open{" "}
              <Link
                href={`/clients/${clientSlug}/corporation-tax`}
                className="font-semibold text-sea hover:underline"
              >
                Corporation Tax → Accounts Production
              </Link>{" "}
              for the company year-end pack.
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
      </div>

      {hasTransactions || (preview && preview.length > 0) ? (
        <details
          id="ct-reassign-bank-statements"
          className="group rounded-xl border border-line bg-white"
          open={reassignOpen || Boolean(preview?.length) || Boolean(openBankKey)}
          onToggle={(e) =>
            setReassignOpen((e.target as HTMLDetailsElement).open)
          }
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
            <span>Reassign bank statements</span>
            <span
              className="shrink-0 text-ink-soft transition group-open:rotate-180"
              aria-hidden
            >
              ▾
            </span>
          </summary>
          <div
            id="categorised-transactions"
            className="space-y-3 border-t border-line p-3"
          >
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
                        "Clear all bank transactions for this client? You can re-import afterwards.",
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
                      setMsg(`Cleared ${res.removed} lines.`);
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
            {hasTransactions ? (
              <BankCategorisedView
                clientId={clientId}
                transactions={transactions}
                customCategories={customCategories}
                missingDesk="CT"
                groupByBank
                highlightDuplicateKeys={duplicateKeys}
                defaultOpenBankKey={openBankKey}
              />
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}

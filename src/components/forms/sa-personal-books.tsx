"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  SA_BOOK_KIND_LABELS,
  SA_BOOK_KINDS,
  parseSaBookCategory,
  saBookCategory,
  type SaBookKind,
} from "@/lib/sa-taxpayer";
import { uploadClientDocument } from "@/server/actions/documents";
import {
  convertBankStatementText,
  importBankConvertedLines,
  type ConvertedBankLine,
} from "@/server/actions/bank";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";
import { extractStatementInBrowser } from "@/lib/bank/extract-statement-browser";
import { downloadBankCsv, downloadBankXlsx } from "@/lib/bank-export";
import { BankCategorisedView } from "@/components/forms/bank-categorised-view";
import { SaBankTaxYearHeads } from "@/components/forms/sa-bank-tax-year-heads";
import { occupationFamilyLabel } from "@/lib/occupation-hints";
import {
  formatMissingMonthsSummary,
  missingBankMonthsByTaxYear,
} from "@/lib/bank/missing-statement-months";
import {
  bankKey,
  extractBankNameFromFilename,
} from "@/lib/bank/bank-tx-meta";

type DocRow = {
  id: string;
  filename: string;
  category: string;
  sizeBytes: number;
  blobUrl: string;
  createdAt: string;
};

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

export function SaPersonalBooks({
  clientId,
  taxpayerId,
  occupation,
  documents,
  transactions = [],
  customCategories = [],
  hasRental = false,
  hasEmployment = false,
  hasSelfEmployment = true,
  clientEmail,
  returns = [],
}: {
  clientId: string;
  taxpayerId: string;
  taxpayerName?: string;
  occupation?: string | null;
  documents: DocRow[];
  transactions?: Tx[];
  customCategories?: Array<{ id: string; label: string }>;
  hasRental?: boolean;
  hasEmployment?: boolean;
  hasSelfEmployment?: boolean;
  clientEmail?: string | null;
  returns?: Array<{
    taxYear: string;
    status: string;
    amendmentIndex?: number | null;
    locked?: boolean | null;
  }>;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [kind, setKind] = useState<SaBookKind>("bank_statement");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  /** Per selected file — bank nickname for multi-statement upload. */
  const [bankNameByFile, setBankNameByFile] = useState<Record<string, string>>(
    {},
  );
  const [selectedStatementIds, setSelectedStatementIds] = useState<string[]>(
    [],
  );
  const [showStatementPicker, setShowStatementPicker] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const [missingStmtMsg, setMissingStmtMsg] = useState<string | null>(null);
  const [convertErr, setConvertErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<ConvertedBankLine[] | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  const [previewBankName, setPreviewBankName] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<
    "pdf" | "ocr" | "csv" | "spreadsheet" | null
  >(null);
  const [duplicateKeys, setDuplicateKeys] = useState<string[] | null>(null);
  const [openBankKey, setOpenBankKey] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const tradeLabel = occupationFamilyLabel(occupation);

  const mine = useMemo(
    () =>
      documents.filter((d) => {
        const parsed = parseSaBookCategory(d.category);
        return parsed?.taxpayerId === taxpayerId;
      }),
    [documents, taxpayerId],
  );

  const docsForKind = mine.filter(
    (d) => parseSaBookCategory(d.category)?.kind === kind,
  );

  const bankStatementDocs = useMemo(
    () =>
      mine.filter(
        (d) => parseSaBookCategory(d.category)?.kind === "bank_statement",
      ),
    [mine],
  );

  const selectedStatements = useMemo(
    () =>
      bankStatementDocs.filter((d) => selectedStatementIds.includes(d.id)),
    [bankStatementDocs, selectedStatementIds],
  );

  const counts = useMemo(() => {
    const map = Object.fromEntries(
      SA_BOOK_KINDS.map((k) => [k, 0]),
    ) as Record<SaBookKind, number>;
    for (const d of mine) {
      const k = parseSaBookCategory(d.category)?.kind;
      if (k) map[k] += 1;
    }
    return map;
  }, [mine]);

  function gbp(pence: number) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(pence / 100);
  }

  async function fileFromUploadedDoc(doc: DocRow): Promise<File> {
    const res = await fetch(doc.blobUrl);
    if (!res.ok) {
      throw new Error(`Could not load ${doc.filename}`);
    }
    const blob = await res.blob();
    const type =
      blob.type ||
      (doc.filename.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "application/octet-stream");
    return new File([blob], doc.filename, { type });
  }

  function runConvert() {
    setConvertErr(null);
    setConvertMsg(null);
    setMissingStmtMsg(null);
    setPreview(null);
    if (!selectedStatements.length) {
      setConvertErr(
        bankStatementDocs.length === 0
          ? "Upload bank statements below first, then choose them here to convert."
          : "Choose one or more uploaded bank statements to convert.",
      );
      setShowStatementPicker(true);
      return;
    }
    start(async () => {
      try {
        const files: File[] = [];
        for (const doc of selectedStatements) {
          files.push(await fileFromUploadedDoc(doc));
        }
        const allLines: ConvertedBankLine[] = [];
        const names: string[] = [];
        let lastSource: "pdf" | "ocr" | "csv" | "spreadsheet" = "pdf";
        const warnings: string[] = [];

        for (const file of files) {
          const name = file.name.toLowerCase();
          const isSheet =
            name.endsWith(".xlsx") ||
            name.endsWith(".xls") ||
            file.type.includes("spreadsheet") ||
            file.type.includes("excel");

          if (isSheet) {
            const extracted = await extractStatementInBrowser(file);
            if (extracted.method === "spreadsheet" || !extracted.text) {
              warnings.push(
                `${file.name}: could not read spreadsheet — try CSV export.`,
              );
              continue;
            }
            const converted = await convertBankStatementText({
              text: extracted.text,
              source: "csv",
              occupation,
            });
            if (!converted.ok) {
              warnings.push(`${file.name}: ${converted.error}`);
              continue;
            }
            allLines.push(...converted.lines);
            names.push(file.name);
            lastSource = "spreadsheet";
            if (extracted.warning) warnings.push(extracted.warning);
            continue;
          }

          const extracted = await extractStatementInBrowser(file);
          if (extracted.method === "spreadsheet") {
            warnings.push(
              `${file.name}: could not read that file. Try CSV from the bank.`,
            );
            continue;
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
            occupation,
          });
          if (!converted.ok) {
            warnings.push(
              extracted.warning
                ? `${file.name}: ${converted.error} ${extracted.warning}`
                : `${file.name}: ${converted.error}`,
            );
            continue;
          }
          allLines.push(...converted.lines);
          names.push(file.name);
          lastSource = convertSource;
          if (extracted.warning) warnings.push(extracted.warning);
          if (
            converted.ok &&
            converted.reconcileStatus === "not_reconciled"
          ) {
            warnings.push(
              `${file.name}: ${converted.message.replace(/^Converted[^.]*\.\s*/, "")}`,
            );
          } else if (converted.ok && converted.reconcileStatus === "reconciled") {
            warnings.push(`${file.name}: Reconciled ✓`);
          }
        }

        if (!allLines.length) {
          setConvertErr(
            warnings.length
              ? warnings.join(" ")
              : "No transactions could be read from those statements.",
          );
          return;
        }

        // Dedupe across files
        const seen = new Set<string>();
        const merged: ConvertedBankLine[] = [];
        for (const line of allLines) {
          const key = `${line.dated}|${line.description}|${line.amountPence}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(line);
        }

        const label =
          names.length === 1 ? names[0]! : `${names.length} statements`;
        const bankFromDocs = selectedStatements
          .map((d) => extractBankNameFromFilename(d.filename))
          .filter((n) => n && n !== "Unnamed bank");
        const bankName =
          bankFromDocs.length === 1
            ? bankFromDocs[0]!
            : extractBankNameFromFilename(label);
        setPreview(merged);
        setPreviewSource(lastSource);
        setPreviewLabel(label);
        setPreviewBankName(bankName);
        setDuplicateKeys(null);
        setOpenBankKey(bankKey(bankName));
        setReassignOpen(true);
        setConvertMsg(
          `Converted ${merged.length} transaction${merged.length === 1 ? "" : "s"} from ${names.length} file${names.length === 1 ? "" : "s"}${tradeLabel ? ` · allocated for ${tradeLabel}` : ""}.${warnings.length ? ` ${warnings.join(" ")}` : ""}`,
        );
        const coverageDates = [
          ...transactions.map((t) => t.dated),
          ...merged.map((l) => l.dated),
        ];
        const missingSummary = formatMissingMonthsSummary(
          missingBankMonthsByTaxYear(coverageDates),
        );
        setMissingStmtMsg(
          missingSummary
            ? `SA · Missing bank statements — ${missingSummary}`
            : null,
        );
        setTimeout(() => {
          document
            .getElementById("sa-categorised-transactions")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      } catch (err) {
        setConvertErr(messageFromUnknown(err, "Conversion failed"));
      }
    });
  }

  function namedUploadFile(file: File): File {
    if (kind !== "bank_statement") return file;
    const bank = (bankNameByFile[file.name] ?? "").trim();
    if (!bank) return file;
    const nextName = file.name.startsWith(`${bank} — `)
      ? file.name
      : `${bank} — ${file.name}`;
    return new File([file], nextName, { type: file.type });
  }

  const showReassign =
    transactions.length > 0 || Boolean(preview && preview.length > 0);

  return (
    <section className="space-y-6">
      {transactions.length > 0 ? (
        <SaBankTaxYearHeads
          clientId={clientId}
          taxpayerId={taxpayerId}
          transactions={transactions}
          clientEmail={clientEmail}
          returns={returns}
          formSignals={{
            occupation,
            hasRental,
            hasEmployment,
            hasSelfEmployment,
          }}
        />
      ) : null}

      {showReassign ? (
        <details
          className="group rounded-xl border border-line bg-white transition-colors [&:not([open])]:hover:bg-sea/10"
          open={reassignOpen || Boolean(preview?.length) || Boolean(openBankKey)}
          onToggle={(e) =>
            setReassignOpen((e.target as HTMLDetailsElement).open)
          }
        >
          <summary className="flex min-h-[4.25rem] cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-base font-semibold text-ink">
                Reassign bank statements
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {transactions.length > 0
                  ? `${transactions.length} transaction${transactions.length === 1 ? "" : "s"} · by bank`
                  : preview && preview.length > 0
                    ? `${preview.length} converted line${preview.length === 1 ? "" : "s"} ready`
                    : "Per-bank cards · merge, rename, delete"}
              </p>
            </div>
            <span
              className="shrink-0 text-xl leading-none text-ink transition group-open:rotate-180"
              aria-hidden
            >
              ▾
            </span>
          </summary>
          <div
            id="sa-categorised-transactions"
            className="space-y-4 border-t border-line p-3"
          >
            {preview && preview.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-sea/30 bg-sea/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ink">
                      Converted · {previewBankName ?? "Unnamed bank"}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      {preview.length} lines
                      {previewLabel ? ` · ${previewLabel}` : ""}
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
                                `${(previewLabel ?? "statement").replace(/\.[^.]+$/, "").replace(/\s+/g, "-")}-converted.csv`,
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
                                `${(previewLabel ?? "statement").replace(/\.[^.]+$/, "").replace(/\s+/g, "-")}-converted.xlsx`,
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
                          setConvertErr(null);
                          try {
                            const bank =
                              previewBankName ??
                              extractBankNameFromFilename(
                                previewLabel ?? "statement",
                              );
                            const res = await importBankConvertedLines({
                              clientId,
                              lines: preview,
                              filename: previewLabel ?? undefined,
                              source: previewSource ?? "pdf",
                              occupation,
                              bankName: bank,
                              mode: "copy_replace",
                            });
                            if (!res.ok) {
                              setConvertErr(res.error);
                              return;
                            }
                            setConvertMsg(res.message);
                            setDuplicateKeys([]);
                            setOpenBankKey(bankKey(res.bankName ?? bank));
                            setReassignOpen(true);
                            setPreview(null);
                            setSelectedStatementIds([]);
                            setShowStatementPicker(false);
                            router.refresh();
                            setTimeout(() => {
                              document
                                .getElementById("sa-categorised-transactions")
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                            }, 80);
                          } catch (err) {
                            setConvertErr(
                              messageFromUnknown(
                                err,
                                "Could not copy and replace",
                              ),
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
                          setConvertErr(null);
                          try {
                            const bank =
                              previewBankName ??
                              extractBankNameFromFilename(
                                previewLabel ?? "statement",
                              );
                            const res = await importBankConvertedLines({
                              clientId,
                              lines: preview,
                              filename: previewLabel ?? undefined,
                              source: previewSource ?? "pdf",
                              occupation,
                              bankName: bank,
                              mode: "merge",
                            });
                            if (!res.ok) {
                              setConvertErr(res.error);
                              return;
                            }
                            setConvertMsg(res.message);
                            setDuplicateKeys(res.duplicateKeys ?? []);
                            setOpenBankKey(bankKey(res.bankName ?? bank));
                            setReassignOpen(true);
                            if ((res.addedCount ?? 0) > 0) {
                              setPreview(null);
                              setSelectedStatementIds([]);
                              setShowStatementPicker(false);
                            }
                            router.refresh();
                            const hasDups =
                              (res.duplicateKeys?.length ?? 0) > 0;
                            setTimeout(() => {
                              document
                                .getElementById(
                                  hasDups
                                    ? "sa-duplicate-transactions"
                                    : "sa-categorised-transactions",
                                )
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                            }, 80);
                          } catch (err) {
                            setConvertErr(
                              messageFromUnknown(err, "Could not save"),
                            );
                          }
                        })
                      }
                    >
                      {pending ? "Saving…" : "SAVE"}
                    </button>
                  </div>
                </div>
                <FormErrorBanner error={convertErr} />
                <div className="max-h-64 overflow-auto rounded-lg border border-line bg-white">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="sticky top-0 bg-sand/90 text-xs uppercase tracking-wide text-ink-soft">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Description</th>
                        <th className="px-3 py-2 text-right font-semibold">
                          Amount
                        </th>
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
                          <td className="px-3 py-1.5 text-ink">
                            {line.description}
                          </td>
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
                </div>
              </div>
            ) : null}

            {transactions.length > 0 ? (
              <BankCategorisedView
                clientId={clientId}
                transactions={transactions}
                customCategories={customCategories}
                missingDesk="SA"
                groupByBank
                highlightDuplicateKeys={duplicateKeys}
                defaultOpenBankKey={openBankKey}
              />
            ) : null}
          </div>
        </details>
      ) : null}

      <div id="sa-personal-books" className="panel scroll-mt-24 p-5">
        <h2 className="display text-2xl text-ink">Personal books</h2>

        <form
          ref={formRef}
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setOk(null);
            const selected = kind;
            const files =
              uploadFiles.length > 0
                ? uploadFiles
                : Array.from(fileInputRef.current?.files ?? []);
            if (!files.length) {
              setError("Choose one or more files to upload.");
              return;
            }
            if (
              selected === "bank_statement" &&
              files.some((f) => !(bankNameByFile[f.name] ?? "").trim())
            ) {
              setError("Name each bank for the statements you are uploading.");
              return;
            }
            start(async () => {
              try {
                const uploaded: string[] = [];
                for (const file of files) {
                  const fd = new FormData();
                  fd.set("clientId", clientId);
                  fd.set("category", saBookCategory(taxpayerId, selected));
                  fd.set("file", namedUploadFile(file));
                  const doc = await uploadClientDocument(fd);
                  uploaded.push(doc.filename);
                }
                setOk(
                  uploaded.length === 1
                    ? `Uploaded ${uploaded[0]}`
                    : `Uploaded ${uploaded.length} statements`,
                );
                setKind(selected);
                setUploadFiles([]);
                setBankNameByFile({});
                formRef.current?.reset();
                const select = formRef.current?.elements.namedItem(
                  "kind",
                ) as HTMLSelectElement | null;
                if (select) select.value = selected;
                router.refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed");
              }
            });
          }}
        >
          <label className="min-w-[10rem] flex-1 text-sm font-semibold">
            Category
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as SaBookKind)}
              className="input mt-1.5 w-full"
            >
              {SA_BOOK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SA_BOOK_KIND_LABELS[k]}
                  {counts[k] ? ` (${counts[k]})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[12rem] flex-[2] text-sm font-semibold">
            File{kind === "bank_statement" ? "s" : ""}
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,application/pdf,image/*,text/csv"
              className="mt-1.5 block w-full text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-sea file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
              onChange={(e) => {
                const next = Array.from(e.target.files ?? []);
                setUploadFiles(next);
                setBankNameByFile((prev) => {
                  const keep: Record<string, string> = {};
                  for (const f of next) {
                    keep[f.name] = prev[f.name] ?? "";
                  }
                  return keep;
                });
              }}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary shrink-0"
          >
            {pending
              ? "Uploading…"
              : uploadFiles.length > 1
                ? `Upload ${uploadFiles.length} files`
                : "Upload"}
          </button>
        </form>

        {kind === "bank_statement" && uploadFiles.length > 0 ? (
          <div className="mt-3 space-y-2 rounded-xl border border-sea/25 bg-sea/5 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-sea">
              Name each bank
            </p>
            <p className="text-xs text-ink-soft">
              Add as many statements as you need — one bank name per file (e.g.
              Barclays, Monzo, Starling).
            </p>
            <ul className="space-y-2">
              {uploadFiles.map((f) => (
                <li
                  key={f.name}
                  className="grid gap-2 sm:grid-cols-[1fr_12rem] sm:items-center"
                >
                  <span className="truncate text-sm font-medium text-ink">
                    {f.name}
                  </span>
                  <input
                    type="text"
                    className="input text-sm"
                    placeholder="Bank name"
                    value={bankNameByFile[f.name] ?? ""}
                    onChange={(e) =>
                      setBankNameByFile((prev) => ({
                        ...prev,
                        [f.name]: e.target.value,
                      }))
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <FormErrorBanner error={error} />
        {ok ? <p className="mt-2 text-sm text-ok">{ok}</p> : null}

        {kind === "bank_statement" ? (
          <div className="mt-4 space-y-3 rounded-xl border border-line bg-sand/30 p-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">Convert/Allocate</h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-secondary px-3 py-1.5 text-sm"
                onClick={() => setShowStatementPicker((v) => !v)}
              >
                Choose statements
              </button>
              <span className="text-sm text-ink-soft">
                {selectedStatements.length === 0
                  ? "None selected from uploaded documents"
                  : selectedStatements.length === 1
                    ? selectedStatements[0]!.filename
                    : `${selectedStatements.length} uploaded statements selected`}
              </span>
              <button
                type="button"
                disabled={pending}
                className="btn btn-primary"
                onClick={runConvert}
              >
                {pending ? "Converting…" : "Convert/Allocate"}
              </button>
            </div>
            {showStatementPicker ? (
              <div className="rounded-lg border border-line bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Uploaded bank statements
                </p>
                {bankStatementDocs.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">
                    No bank statements uploaded yet. Use Upload above, name each
                    bank, then choose them here.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-48 space-y-1.5 overflow-auto">
                    {bankStatementDocs.map((d) => {
                      const checked = selectedStatementIds.includes(d.id);
                      return (
                        <li key={d.id}>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setPreview(null);
                                setSelectedStatementIds((prev) =>
                                  checked
                                    ? prev.filter((id) => id !== d.id)
                                    : [...prev, d.id],
                                );
                              }}
                            />
                            <span className="min-w-0 truncate font-medium">
                              {d.filename}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
            <FormErrorBanner error={convertErr} />
            {convertMsg ? (
              <p className="text-sm text-ok">{convertMsg}</p>
            ) : null}
            {missingStmtMsg ? (
              <p className="mt-1 text-sm text-amber-800">{missingStmtMsg}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-soft">
            {SA_BOOK_KIND_LABELS[kind]} · {docsForKind.length}
          </p>
          {docsForKind.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">None yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-line/70">
              {docsForKind.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="min-w-0 font-semibold text-ink line-clamp-1">
                    {d.filename}
                  </span>
                  <a
                    href={d.blobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs font-semibold text-sea hover:underline"
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

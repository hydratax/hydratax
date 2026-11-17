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
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [kind, setKind] = useState<SaBookKind>("bank_statement");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [selectedStatementIds, setSelectedStatementIds] = useState<string[]>(
    [],
  );
  const [showStatementPicker, setShowStatementPicker] = useState(false);
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const [missingStmtMsg, setMissingStmtMsg] = useState<string | null>(null);
  const [convertErr, setConvertErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<ConvertedBankLine[] | null>(null);
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<
    "pdf" | "ocr" | "csv" | "spreadsheet" | null
  >(null);

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

        setPreview(merged);
        setPreviewSource(lastSource);
        setPreviewLabel(
          names.length === 1
            ? names[0]
            : `${names.length} statements`,
        );
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
            ? `Missing bank statements — ${missingSummary}`
            : null,
        );
        setTimeout(() => {
          document
            .getElementById("sa-statement-convert-preview")
            ?.scrollIntoView({ behavior: "smooth" });
        }, 50);
      } catch (err) {
        setConvertErr(messageFromUnknown(err, "Conversion failed"));
      }
    });
  }

  return (
    <section className="space-y-6">
      <div className="panel p-5">
        <h2 className="display text-2xl text-ink">Personal books</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Receipts, bank statements and other records for this return.
          {tradeLabel ? (
            <>
              {" "}
              Allocation uses occupation: <span className="font-semibold text-ink">{tradeLabel}</span>
              {occupation?.trim() ? ` (${occupation.trim()})` : ""}.
            </>
          ) : occupation?.trim() ? (
            <> Occupation on file: {occupation.trim()}.</>
          ) : (
            <> Set occupation on the person profile for smarter bank allocation (e.g. taxi driver).</>
          )}
        </p>

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
            start(async () => {
              try {
                const uploaded: string[] = [];
                for (const file of files) {
                  const fd = new FormData();
                  fd.set("clientId", clientId);
                  fd.set("category", saBookCategory(taxpayerId, selected));
                  fd.set("file", file);
                  const doc = await uploadClientDocument(fd);
                  uploaded.push(doc.filename);
                }
                setOk(
                  uploaded.length === 1
                    ? `Uploaded ${uploaded[0]}`
                    : `Uploaded ${uploaded.length} files`,
                );
                setKind(selected);
                setUploadFiles([]);
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
            File
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,application/pdf,image/*,text/csv"
              className="mt-1.5 block w-full text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-sea file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
              onChange={(e) => {
                setUploadFiles(Array.from(e.target.files ?? []));
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

        <FormErrorBanner error={error} />
        {ok ? <p className="mt-2 text-sm text-ok">{ok}</p> : null}
        {uploadFiles.length > 1 ? (
          <p className="mt-2 text-xs text-ink-soft">
            {uploadFiles.length} files selected:{" "}
            {uploadFiles.map((f) => f.name).join(", ")}
          </p>
        ) : null}

        {kind === "bank_statement" ? (
          <div className="mt-4 space-y-3 rounded-xl border border-line bg-sand/30 p-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Convert &amp; allocate statements
              </h3>
              <p className="mt-1 text-xs text-ink-soft">
                Extract transactions from PDF, photo, CSV or Excel in this same
                section, preview allocation, then save to personal books.
                {tradeLabel
                  ? ` Allocation favours expense heads for ${tradeLabel.toLowerCase()}.`
                  : ""}
              </p>
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
                {pending ? "Converting…" : "Convert & allocate"}
              </button>
            </div>
            {showStatementPicker ? (
              <div className="rounded-lg border border-line bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Uploaded bank statements
                </p>
                {bankStatementDocs.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-soft">
                    No bank statements uploaded yet. Use Upload above, then
                    choose them here.
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

      {preview && preview.length > 0 ? (
        <div
          id="sa-statement-convert-preview"
          className="panel space-y-4 border-sea/30 p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="display text-xl text-ink">Converted transactions</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {preview.length} lines ready
                {previewLabel ? ` from ${previewLabel}` : ""}. Download CSV, or
                save into this person’s books to review allocation.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() =>
                  downloadBankCsv(
                    preview,
                    `${(previewLabel ?? "statement").replace(/\.[^.]+$/, "").replace(/\s+/g, "-")}-converted.csv`,
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
                    `${(previewLabel ?? "statement").replace(/\.[^.]+$/, "").replace(/\s+/g, "-")}-converted.xlsx`,
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
                    setConvertErr(null);
                    try {
                      const res = await importBankConvertedLines({
                        clientId,
                        lines: preview,
                        filename: previewLabel ?? undefined,
                        source: previewSource ?? "pdf",
                        occupation,
                      });
                      if (!res.ok) {
                        setConvertErr(res.error);
                        return;
                      }
                      setConvertMsg(res.message);
                      setPreview(null);
                      setSelectedStatementIds([]);
                      setShowStatementPicker(false);
                      router.refresh();
                      setTimeout(() => {
                        document
                          .getElementById("sa-categorised-transactions")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }, 50);
                    } catch (err) {
                      setConvertErr(
                        messageFromUnknown(err, "Could not save to books"),
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
                Showing first 80 of {preview.length} lines.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {transactions.length > 0 ? (
        <div className="space-y-6">
          <SaBankTaxYearHeads
            clientId={clientId}
            taxpayerId={taxpayerId}
            transactions={transactions}
            clientEmail={clientEmail}
            formSignals={{
              occupation,
              hasRental,
              hasEmployment,
              hasSelfEmployment,
            }}
          />
          <details className="group rounded-xl border border-line bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
              <span>
                Reassign bank categories
                <span className="ml-2 text-sm font-normal text-ink-soft">
                  (move lines before allocating to SA forms)
                </span>
              </span>
              <span
                className="shrink-0 text-ink-soft transition group-open:rotate-180"
                aria-hidden
              >
                ▾
              </span>
            </summary>
            <div id="sa-categorised-transactions" className="border-t border-line p-3">
              <BankCategorisedView
                clientId={clientId}
                transactions={transactions}
                customCategories={customCategories}
              />
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}

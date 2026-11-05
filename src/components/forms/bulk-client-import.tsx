"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  bulkImportClients,
  type BulkImportRowResult,
} from "@/server/actions/clients";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";
import {
  BULK_IMPORT_FIELD_LABELS,
  previewImportColumns,
  toPlainBulkImportRow,
  type ColumnMappingPreview,
} from "@/lib/bulk-client-import-map";
import {
  BULK_IMPORT_NOT_STORED,
  BULK_IMPORT_TEMPLATE_COLUMNS,
  BULK_IMPORT_TEMPLATE_FILENAME,
  bulkImportSampleRows,
} from "@/lib/bulk-client-import-template";

/** Keep each server round-trip small so Netlify/Vercel do not time out. */
const IMPORT_BATCH = 40;

function downloadSampleFile() {
  const headers = BULK_IMPORT_TEMPLATE_COLUMNS.map((c) => c.header);
  const sample = bulkImportSampleRows();
  const clientsSheet = XLSX.utils.json_to_sheet(sample, { header: headers });
  clientsSheet["!cols"] = headers.map((h) => ({
    wch: Math.max(14, h.length + 2),
  }));

  const guideRows = [
    {
      column: "HOW TO USE THIS FILE",
      label: "",
      required: "",
      applies_to: "",
      description:
        "1) Keep the header row on the Clients sheet. 2) Replace the example rows with your clients (or clear examples and paste your data under the same headers). 3) Or build your own spreadsheet using these exact column names — or any accepted alternative listed below. Extra columns (address, SIC, etc.) are ignored.",
      example: "",
      also_accepts: "",
    },
    {
      column: "",
      label: "",
      required: "",
      applies_to: "",
      description: "",
      example: "",
      also_accepts: "",
    },
    ...BULK_IMPORT_TEMPLATE_COLUMNS.map((c) => ({
      column: c.header,
      label: c.label,
      required: c.importance,
      applies_to: c.appliesTo,
      description: c.description,
      example: c.example,
      also_accepts: c.alsoAccepts.join("; "),
    })),
    {
      column: "",
      label: "",
      required: "",
      applies_to: "",
      description: "",
      example: "",
      also_accepts: "",
    },
    {
      column: "NOT IMPORTED",
      label: "",
      required: "",
      applies_to: "",
      description: BULK_IMPORT_NOT_STORED.join(" · "),
      example: "",
      also_accepts:
        "These fields are not stored on the HydraTax client record yet — leave them out or they will be ignored.",
    },
  ];
  const guideSheet = XLSX.utils.json_to_sheet(guideRows, {
    header: [
      "column",
      "label",
      "required",
      "applies_to",
      "description",
      "example",
      "also_accepts",
    ],
  });
  guideSheet["!cols"] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 12 },
    { wch: 22 },
    { wch: 70 },
    { wch: 22 },
    { wch: 40 },
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, clientsSheet, "Clients");
  XLSX.utils.book_append_sheet(book, guideSheet, "Field guide");
  XLSX.writeFile(book, BULK_IMPORT_TEMPLATE_FILENAME);
}

function sheetToRows(file: ArrayBuffer): Record<string, unknown>[] {
  const book = XLSX.read(file, { type: "array" });
  const first = book.SheetNames[0];
  if (!first) throw new Error("Workbook has no sheets");
  const sheet = book.Sheets[first];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  return rows.filter((r) =>
    Object.values(r).some((v) => String(v ?? "").trim() !== ""),
  );
}

export function BulkClientImport() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState(0);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [columnPreview, setColumnPreview] =
    useState<ColumnMappingPreview | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    created: number;
    skipped: number;
    updated: number;
    failed: number;
    results: BulkImportRowResult[];
  } | null>(null);

  const canImport = useMemo(
    () =>
      Boolean(
        rows && rows.length > 0 && rows.length <= 1000 && !pending && !importDone,
      ),
    [rows, pending, importDone],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-sand/40 p-4 text-sm text-ink">
        <p className="font-semibold text-ink">Sample import file</p>
        <p className="mt-1 text-ink-soft">
          Download the sample workbook first. Sheet <strong>Clients</strong>{" "}
          lists every field HydraTax can store, with three example rows. Sheet{" "}
          <strong>Field guide</strong> explains each column, what is required,
          and alternative header names. Replace the examples with your data, or
          match your own file to those headers.
        </p>
        <button
          type="button"
          className="btn btn-secondary mt-3"
          onClick={downloadSampleFile}
        >
          Download sample Excel ({BULK_IMPORT_TEMPLATE_COLUMNS.length} fields)
        </button>
      </div>

      <label className="panel flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-10 text-center transition hover:border-sea">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="absolute h-px w-px opacity-0"
          disabled={pending}
          onChange={async (e) => {
            setError(null);
            setSummary(null);
            setImportDone(false);
            setProgress(null);
            setColumnPreview(null);
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const buf = await file.arrayBuffer();
              const parsed = sheetToRows(buf);
              if (parsed.length === 0) {
                throw new Error("No data rows found");
              }
              if (parsed.length > 1000) {
                throw new Error(
                  `File has ${parsed.length} rows — maximum is 1000`,
                );
              }
              const headers = Object.keys(parsed[0] ?? {});
              const preview = previewImportColumns(headers);
              if (
                !preview.recognized.some(
                  (r) => r.field === "name" || r.field === "companyNumber",
                )
              ) {
                throw new Error(
                  "No company name or company number column recognised. Check the header row matches fields HydraTax supports (see mapping below after a valid file).",
                );
              }
              // Strip to recognised fields as plain strings — Excel cells
              // (and fat CH exports) are not safe to pass to server actions.
              const plainRows = parsed.map((r) => toPlainBulkImportRow(r));
              setColumnPreview(preview);
              setRows(plainRows);
              setPreviewCount(plainRows.length);
              setFileName(file.name);
            } catch (err) {
              setRows(null);
              setFileName(null);
              setPreviewCount(0);
              setColumnPreview(null);
              setError(
                err instanceof Error ? err.message : "Could not read file",
              );
            }
          }}
        />
        <span className="display text-xl text-ink">
          {fileName ? fileName : "Drop Excel here or click to browse"}
        </span>
        <span className="text-sm text-ink-soft">
          .xlsx / .xls / .csv · up to 1000 clients
          {previewCount > 0 ? ` · ${previewCount} rows ready` : ""}
        </span>
      </label>

      <FormErrorBanner error={error} />

      {columnPreview && (
        <div className="panel space-y-3 p-4 text-left text-sm">
          <p className="font-semibold text-ink">Column check</p>
          <p className="text-ink-soft">
            Only recognised HydraTax fields are imported. Address and other
            columns are ignored (we don&apos;t store registered office on the
            client record yet).
          </p>
          {columnPreview.recognized.length > 0 ? (
            <ul className="space-y-1">
              {columnPreview.recognized.map((r) => (
                <li key={`${r.header}-${r.field}`}>
                  <span className="font-medium text-ink">{r.header}</span>
                  <span className="text-ink-soft"> → </span>
                  <span className="text-sea">
                    {BULK_IMPORT_FIELD_LABELS[r.field] ?? r.field}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-danger">No supported columns found.</p>
          )}
          {columnPreview.ignored.length > 0 ? (
            <p className="text-xs text-ink-soft">
              Ignored ({columnPreview.ignored.length}):{" "}
              {columnPreview.ignored.slice(0, 12).join(", ")}
              {columnPreview.ignored.length > 12
                ? ` +${columnPreview.ignored.length - 12} more`
                : ""}
            </p>
          ) : null}
        </div>
      )}

      {progress ? (
        <p className="text-sm font-semibold text-sea">{progress}</p>
      ) : null}

      <button
        type="button"
        className="btn btn-primary disabled:opacity-60"
        disabled={!canImport}
        onClick={() => {
          if (!rows || importDone) return;
          setError(null);
          setProgress(null);
          start(async () => {
            try {
              const allResults: BulkImportRowResult[] = [];
              let created = 0;
              let skipped = 0;
              let updated = 0;
              let failed = 0;
              const total = rows.length;

              for (let i = 0; i < total; i += IMPORT_BATCH) {
                const batch = rows
                  .slice(i, i + IMPORT_BATCH)
                  .map((r) => ({ ...toPlainBulkImportRow(r) }));
                setProgress(
                  `Importing ${Math.min(i + batch.length, total)} of ${total}…`,
                );
                const res = await bulkImportClients(batch);
                // Re-number rows relative to the whole file for the summary table
                const offset = i;
                for (const r of res.results) {
                  allResults.push({ ...r, row: r.row + offset });
                }
                created += res.created;
                skipped += res.skipped;
                updated += res.updated;
                failed += res.failed;
              }

              setImportDone(true);
              setProgress(null);
              const summaryRes = {
                created,
                skipped,
                updated,
                failed,
                results: allResults.sort((a, b) => a.row - b.row),
              };

              if (failed > 0 || skipped > 0 || updated > 0) {
                setSummary(summaryRes);
                if (failed === 0 && created > 0) {
                  // Partial success with skips — still offer navigation via summary
                }
                return;
              }

              const params = new URLSearchParams();
              if (created) params.set("imported", String(created));
              if (skipped) params.set("skipped", String(skipped));
              if (updated) params.set("updated", String(updated));
              const qs = params.toString();
              router.push(qs ? `/clients?${qs}` : "/clients");
              router.refresh();
            } catch (err) {
              setProgress(null);
              setError(
                messageFromUnknown(
                  err,
                  "Import failed. Try again — large files are imported in smaller batches.",
                ),
              );
            }
          });
        }}
      >
        {pending
          ? progress ?? "Importing…"
          : importDone
            ? "Import complete"
            : `Import ${previewCount || ""} clients`}
      </button>

      {summary && (
        <ImportSummary
          summary={summary}
          onGoToClients={() => {
            router.push("/clients");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ImportSummary({
  summary,
  onGoToClients,
}: {
  summary: {
    created: number;
    skipped: number;
    updated: number;
    failed: number;
    results: BulkImportRowResult[];
  };
  onGoToClients: () => void;
}) {
  const failed = summary.results.filter((r) => !r.ok);
  const notable = summary.results.filter(
    (r) => !r.ok || r.skipped || r.updated,
  );
  const [filter, setFilter] = useState<"problems" | "all">(
    failed.length > 0 || notable.length < summary.results.length
      ? "problems"
      : "all",
  );

  const shown =
    filter === "problems"
      ? notable.length > 0
        ? notable
        : summary.results
      : summary.results;

  function downloadFailures() {
    if (failed.length === 0) return;
    const lines = [
      "excel_row,name,error",
      ...failed.map(
        (r) =>
          `${r.row},"${String(r.name).replace(/"/g, '""')}","${String(r.error ?? "Failed").replace(/"/g, '""')}"`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hydratax-import-failures.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <p className="font-semibold text-ink">
          Imported {summary.created}
          {summary.updated ? ` · updated ${summary.updated}` : ""}
          {summary.skipped ? ` · skipped ${summary.skipped}` : ""}
          {summary.failed ? ` · failed ${summary.failed}` : ""}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Existing clients with auth codes or other identifiers in the file are
          updated automatically. Rows with no new data are skipped. Companies
          House details load when you open each client.
        </p>

        {failed.length > 0 && (
          <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-left">
            <p className="font-semibold text-ink">
              {failed.length === 1
                ? "1 row failed — fix in Excel and re-import that row"
                : `${failed.length} rows failed — fix in Excel and re-import`}
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {failed.map((r) => (
                <li key={`fail-${r.row}-${r.name}`} className="text-ink">
                  <span className="mono text-ink-soft">Excel row {r.row}</span>
                  {" · "}
                  <span className="font-semibold">{r.name || "(blank)"}</span>
                  {" — "}
                  <span className="text-danger">{r.error ?? "Failed"}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-secondary mt-3 text-sm"
              onClick={downloadFailures}
            >
              Download failed rows (CSV)
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {summary.created > 0 || summary.updated > 0 ? (
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={onGoToClients}
            >
              Go to clients
            </button>
          ) : null}
          <div className="flex gap-1 text-sm">
            <button
              type="button"
              className={`rounded-md px-2 py-1 ${
                filter === "problems"
                  ? "bg-sea/15 font-semibold text-sea"
                  : "text-ink-soft"
              }`}
              onClick={() => setFilter("problems")}
            >
              Problems ({notable.length})
            </button>
            <button
              type="button"
              className={`rounded-md px-2 py-1 ${
                filter === "all"
                  ? "bg-sea/15 font-semibold text-sea"
                  : "text-ink-soft"
              }`}
              onClick={() => setFilter("all")}
            >
              All rows ({summary.results.length})
            </button>
          </div>
        </div>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-sand/95 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-2">Excel row</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr
                key={`${r.row}-${r.name}`}
                className={!r.ok ? "bg-danger/5" : undefined}
              >
                <td className="mono px-4 py-2">{r.row}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2">
                  {r.ok && r.updated ? (
                    <span className="text-sea">
                      Updated · {r.error ?? "Identifiers saved"}
                    </span>
                  ) : r.ok && r.skipped ? (
                    <span className="text-ink-soft">
                      Skipped · {r.error ?? "Already exists"}
                    </span>
                  ) : r.ok ? (
                    <span className="text-sea">OK</span>
                  ) : (
                    <span className="font-medium text-danger">
                      Failed · {r.error}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  bulkImportClients,
  type BulkImportRowResult,
} from "@/server/actions/clients";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

const TEMPLATE_HEADERS = [
  "name",
  "type",
  "company_number",
  "company_auth_code",
  "utr",
  "vrn",
  "nino",
  "paye_ref",
  "accounts_office_ref",
  "contact_email",
  "is_vat_registered",
  "is_employer",
] as const;

function downloadTemplate() {
  const sample = [
    {
      name: "Example Trading Ltd",
      type: "limited_company",
      company_number: "12345678",
      company_auth_code: "ABC123",
      utr: "",
      vrn: "",
      nino: "",
      paye_ref: "",
      accounts_office_ref: "",
      contact_email: "accounts@example.com",
      is_vat_registered: "yes",
      is_employer: "no",
    },
    {
      name: "Amina Patel",
      type: "sole_trader",
      company_number: "",
      utr: "",
      vrn: "",
      nino: "",
      paye_ref: "",
      accounts_office_ref: "",
      contact_email: "",
      is_vat_registered: "yes",
      is_employer: "no",
    },
  ];
  const sheet = XLSX.utils.json_to_sheet(sample, {
    header: [...TEMPLATE_HEADERS],
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Clients");
  XLSX.writeFile(book, "hydratax-clients-template.xlsx");
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
  const [importDone, setImportDone] = useState(false);
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
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={downloadTemplate}
        >
          Download Excel template
        </button>
      </div>

      <label className="panel flex cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-10 text-center transition hover:border-sea">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="sr-only"
          disabled={pending}
          onChange={async (e) => {
            setError(null);
            setSummary(null);
            setImportDone(false);
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
              setRows(parsed);
              setPreviewCount(parsed.length);
              setFileName(file.name);
            } catch (err) {
              setRows(null);
              setFileName(null);
              setPreviewCount(0);
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

      <button
        type="button"
        className="btn btn-primary disabled:opacity-60"
        disabled={!canImport}
        onClick={() => {
          if (!rows || importDone) return;
          setError(null);
          start(async () => {
            try {
              const res = await bulkImportClients(rows);
              setImportDone(true);

              if (res.failed > 0) {
                setSummary(res);
                return;
              }

              const params = new URLSearchParams();
              if (res.created) params.set("imported", String(res.created));
              if (res.skipped) params.set("skipped", String(res.skipped));
              if (res.updated) params.set("updated", String(res.updated));
              const qs = params.toString();
              router.push(qs ? `/clients?${qs}` : "/clients");
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Import failed");
            }
          });
        }}
      >
        {pending
          ? "Importing… (Companies House lookups may take a minute)"
          : importDone
            ? "Import complete"
            : `Import ${previewCount || ""} clients`}
      </button>

      {summary && (
        <div className="panel overflow-hidden">
          <div className="border-b border-line px-4 py-3">
            <p className="font-semibold text-ink">
              Imported {summary.created}
              {summary.updated ? ` · updated ${summary.updated}` : ""}
              {summary.skipped ? ` · skipped ${summary.skipped}` : ""}
              {summary.failed ? ` · failed ${summary.failed}` : ""}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Existing clients with auth codes or other identifiers in the file
              are updated automatically. Rows with no new data are skipped.
            </p>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-sand/80 text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-4 py-2">Row</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.results.map((r) => (
                  <tr key={`${r.row}-${r.name}`}>
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
                        <span className="text-sea">
                          OK
                          {r.companiesHouse ? " · CH" : ""}
                        </span>
                      ) : (
                        <span className="text-danger">{r.error}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

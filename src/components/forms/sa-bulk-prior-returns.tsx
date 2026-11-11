"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  guessSaFilingFromFilename,
  saFiledCategory,
  type SaFiledKind,
} from "@/lib/sa-filed-docs";
import { listSaTaxYears } from "@/lib/sa-tax-year";
import { uploadClientDocument } from "@/server/actions/documents";
import {
  recordSa302Upload,
  recordSubmittedSaReturn,
} from "@/server/actions/sa100";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";

export type SaBulkPersonOption = {
  key: string;
  label: string;
  clientId: string;
  taxpayerId: string | null;
};

type Row = {
  id: string;
  file: File;
  personKey: string;
  taxYear: string;
  kind: SaFiledKind;
  status: "pending" | "uploading" | "done" | "error";
  message?: string;
};

export function SaBulkPriorReturns({
  people,
}: {
  people: SaBulkPersonOption[];
}) {
  const router = useRouter();
  const years = useMemo(() => listSaTaxYears(8).map((y) => y.label), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const defaultPerson = people[0]?.key ?? "";
    const next: Row[] = [];
    for (const file of Array.from(fileList)) {
      const guess = guessSaFilingFromFilename(file.name);
      next.push({
        id: crypto.randomUUID(),
        file,
        personKey: defaultPerson,
        taxYear: guess.taxYear ?? years[1] ?? years[0] ?? "2024-25",
        kind: guess.kind,
        status: "pending",
      });
    }
    setRows((prev) => [...prev, ...next]);
    setErr(null);
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function uploadAll() {
    if (!rows.length) {
      setErr("Add at least one PDF first.");
      return;
    }
    if (rows.some((r) => !r.personKey)) {
      setErr("Choose a person for every file.");
      return;
    }
    setErr(null);
    start(async () => {
      for (const row of rows) {
        if (row.status === "done") continue;
        const person = people.find((p) => p.key === row.personKey);
        if (!person) {
          updateRow(row.id, {
            status: "error",
            message: "Person not found",
          });
          continue;
        }
        updateRow(row.id, { status: "uploading", message: undefined });
        try {
          const fd = new FormData();
          fd.set("clientId", person.clientId);
          fd.set(
            "category",
            saFiledCategory(row.taxYear, row.kind, person.taxpayerId),
          );
          fd.set("file", row.file);
          const doc = await uploadClientDocument(fd);
          if (row.kind === "sa302") {
            await recordSa302Upload({
              clientId: person.clientId,
              taxYear: row.taxYear,
              taxpayerId: person.taxpayerId,
              documentId: doc.id,
              filename: doc.filename,
            });
          } else {
            await recordSubmittedSaReturn({
              clientId: person.clientId,
              taxYear: row.taxYear,
              taxpayerId: person.taxpayerId,
              documentId: doc.id,
              filename: doc.filename,
            });
          }
          updateRow(row.id, {
            status: "done",
            message: `${row.kind === "sa302" ? "SA302" : "Return"} · ${row.taxYear}`,
          });
        } catch (e) {
          updateRow(row.id, {
            status: "error",
            message: messageFromUnknown(e, "Upload failed"),
          });
        }
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="panel space-y-3 p-5">
        <h2 className="display text-2xl text-ink">Drop prior-year PDFs</h2>
        <p className="text-sm text-ink-soft">
          Upload many SA100 returns and SA302s at once. We guess the tax year
          and whether a file is an SA302 from the filename — check each row
          before uploading.
        </p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-sand/40 px-4 py-10 text-center text-sm text-ink-soft hover:border-sea/40">
          <span className="font-semibold text-ink">
            Choose PDFs or drag them here
          </span>
          <span>PDF, JPG or PNG · map each file to a person and year</span>
          <input
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <FormErrorBanner error={err} />

      {rows.length > 0 ? (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="font-semibold text-ink">
              {rows.length} file{rows.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={pending}
              onClick={uploadAll}
            >
              {pending ? "Uploading…" : "Upload all"}
            </button>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-sand/80 text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="max-w-[14rem] truncate px-4 py-3 font-medium text-ink">
                    {row.file.name}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input py-1 text-xs"
                      value={row.personKey}
                      disabled={row.status === "done" || pending}
                      onChange={(e) =>
                        updateRow(row.id, { personKey: e.target.value })
                      }
                    >
                      {people.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input py-1 text-xs"
                      value={row.taxYear}
                      disabled={row.status === "done" || pending}
                      onChange={(e) =>
                        updateRow(row.id, { taxYear: e.target.value })
                      }
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input py-1 text-xs"
                      value={row.kind}
                      disabled={row.status === "done" || pending}
                      onChange={(e) =>
                        updateRow(row.id, {
                          kind: e.target.value as SaFiledKind,
                        })
                      }
                    >
                      <option value="return">SA100 return</option>
                      <option value="sa302">SA302</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.status === "pending" ? (
                      <span className="text-ink-soft">Ready</span>
                    ) : null}
                    {row.status === "uploading" ? (
                      <span className="text-sea">Uploading…</span>
                    ) : null}
                    {row.status === "done" ? (
                      <span className="font-medium text-ok">
                        {row.message ?? "Saved"}
                      </span>
                    ) : null}
                    {row.status === "error" ? (
                      <span className="font-medium text-danger">
                        {row.message ?? "Failed"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.status !== "done" ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger"
                        disabled={pending}
                        onClick={() => removeRow(row.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {people.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No Self Assessment people found yet. Add a sole trader client or
          director first, then come back to bulk-upload their prior years.
        </p>
      ) : null}
    </div>
  );
}

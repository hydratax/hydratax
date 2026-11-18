"use client";

import { useRef, useState, useTransition } from "react";
import { uploadClientDocument } from "@/server/actions/documents";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

const CATEGORIES = [
  { value: "self_assessment:other", label: "Self Assessment" },
  { value: "vat:other", label: "VAT" },
  { value: "corporation_tax:other", label: "Corporation Tax" },
  { value: "self_assessment:bank_statement", label: "SA · Bank statement" },
  { value: "vat:bank_statement", label: "VAT · Bank statement" },
  { value: "corporation_tax:bank_statement", label: "CT · Bank statement" },
  { value: "self_assessment:receipt", label: "SA · Receipt" },
  { value: "vat:receipt", label: "VAT · Receipt" },
  { value: "corporation_tax:receipt", label: "CT · Receipt" },
  { value: "self_assessment:invoice", label: "SA · Invoice" },
  { value: "vat:invoice", label: "VAT · Invoice" },
  { value: "corporation_tax:invoice", label: "CT · Invoice" },
  { value: "general", label: "Other" },
  { value: "companies_house", label: "Companies House" },
] as const;

export function DocumentUploadForm({ clientId }: { clientId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="panel gloss-card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        const fd = new FormData(e.currentTarget);
        fd.set("clientId", clientId);
        startTransition(async () => {
          try {
            const doc = await uploadClientDocument(fd);
            setOk(`Uploaded ${doc.filename}`);
            formRef.current?.reset();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
          }
        });
      }}
    >
      <div>
        <h3 className="display text-xl text-ink">Upload documents</h3>
        <p className="mt-1 text-sm text-ink-soft">
          PDFs, images, CSV, or Excel — max 15 MB. Files are stored privately
          and linked to this client for HMRC preparation.
        </p>
      </div>

      <label className="block text-sm font-semibold text-ink">
        Category
        <select
          name="category"
          defaultValue="corporation_tax:other"
          className="mt-1.5 w-full rounded-lg border border-line bg-white px-3 py-2 font-normal"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-semibold text-ink">
        File
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,application/pdf,image/*,text/csv"
          className="mt-1.5 block w-full text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-sea file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
        />
      </label>

      <FormErrorBanner error={error} />
      {ok && <p className="text-sm text-ok">{ok}</p>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Uploading…" : "Upload to client file"}
      </button>
    </form>
  );
}

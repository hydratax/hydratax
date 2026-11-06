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
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type DocRow = {
  id: string;
  filename: string;
  category: string;
  sizeBytes: number;
  blobUrl: string;
  createdAt: string;
};

export function SaPersonalBooks({
  clientId,
  taxpayerId,
  documents,
}: {
  clientId: string;
  taxpayerId: string;
  taxpayerName?: string;
  documents: DocRow[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [kind, setKind] = useState<SaBookKind>("receipt");

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

  return (
    <section className="panel p-5">
      <h2 className="display text-2xl text-ink">Personal books</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Receipts, bank statements and other records for this return.
      </p>

      <form
        ref={formRef}
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          setOk(null);
          const fd = new FormData(e.currentTarget);
          const selected = String(fd.get("kind") || kind) as SaBookKind;
          fd.set("clientId", clientId);
          fd.set("category", saBookCategory(taxpayerId, selected));
          start(async () => {
            try {
              const doc = await uploadClientDocument(fd);
              setOk(`Uploaded ${doc.filename}`);
              setKind(selected);
              formRef.current?.reset();
              // keep selected kind after reset
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
            type="file"
            name="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,application/pdf,image/*,text/csv"
            className="mt-1.5 block w-full text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-sea file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary shrink-0"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>

      <FormErrorBanner error={error} />
      {ok ? <p className="mt-2 text-sm text-ok">{ok}</p> : null}

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
    </section>
  );
}

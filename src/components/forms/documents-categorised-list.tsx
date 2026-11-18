"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateClientDocumentCategory } from "@/server/actions/documents";
import {
  BOOKS_DESK_LABEL,
  BOOKS_DESKS,
  BOOKS_DOC_KIND_LABEL,
  BOOKS_DOC_KINDS,
  booksCategory,
  parseBooksCategory,
  type BooksDesk,
  type BooksDocKind,
} from "@/lib/bank/books-desk-docs";

type ClientDoc = {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  category: string;
};

const OTHER_GROUP = "other" as const;

function groupKey(category: string): BooksDesk | typeof OTHER_GROUP {
  const parsed = parseBooksCategory(category);
  if (parsed?.desk) return parsed.desk;
  if (category === "vat") return "vat";
  if (category === "corporation_tax" || category === "accounts")
    return "corporation_tax";
  if (category === "self_assessment" || category.startsWith("sa:"))
    return "self_assessment";
  return OTHER_GROUP;
}

function currentKind(category: string): BooksDocKind {
  const parsed = parseBooksCategory(category);
  if (parsed?.kind) return parsed.kind;
  if (/receipt/.test(category)) return "receipt";
  if (/invoice/.test(category)) return "invoice";
  if (/other/.test(category)) return "other";
  return "bank_statement";
}

function canOpen(url: string) {
  return (
    url.startsWith("http") ||
    url.startsWith("/") ||
    url.startsWith("data:")
  );
}

const GROUP_ORDER: Array<BooksDesk | typeof OTHER_GROUP> = [
  ...BOOKS_DESKS,
  OTHER_GROUP,
];

const GROUP_LABEL: Record<BooksDesk | typeof OTHER_GROUP, string> = {
  ...BOOKS_DESK_LABEL,
  other: "Other",
};

export function DocumentsCategorisedList({
  clientId,
  documents,
}: {
  clientId: string;
  documents: ClientDoc[];
}) {
  const router = useRouter();
  const [, start] = useTransition();

  const grouped = useMemo(() => {
    const map = new Map<BooksDesk | typeof OTHER_GROUP, ClientDoc[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const doc of documents) {
      const key = groupKey(doc.category);
      map.get(key)!.push(doc);
    }
    return GROUP_ORDER.map((key) => ({
      key,
      label: GROUP_LABEL[key],
      docs: map.get(key) ?? [],
    })).filter((g) => g.docs.length > 0);
  }, [documents]);

  function setCategory(
    documentId: string,
    desk: BooksDesk | typeof OTHER_GROUP,
    kind: BooksDocKind,
  ) {
    const category =
      desk === OTHER_GROUP ? "general" : booksCategory(desk, kind);
    start(async () => {
      try {
        await updateClientDocumentCategory({
          clientId,
          documentId,
          category,
        });
        router.refresh();
      } catch {
        /* freeze */
      }
    });
  }

  if (documents.length === 0) {
    return (
      <p className="p-6 text-sm text-ink-soft">No documents yet.</p>
    );
  }

  return (
    <div className="divide-y divide-line">
      {grouped.map((group) => (
        <section key={group.key} className="px-4 py-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-sea">
            {group.label}
            <span className="ml-2 font-semibold text-ink-soft">
              ({group.docs.length})
            </span>
          </h3>
          {group.docs.length === 0 ? (
            <p className="mt-2 text-xs text-ink-soft">No files in this desk.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-paper">
              {group.docs.map((doc) => {
                const desk = groupKey(doc.category);
                const kind = currentKind(doc.category);
                return (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">
                        {doc.filename}
                      </p>
                      <p className="text-[11px] text-ink-soft">
                        {(doc.sizeBytes / 1024).toFixed(0)} KB ·{" "}
                        {new Date(doc.createdAt).toLocaleString("en-GB")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`desk-${doc.id}`}>
                        Desk
                      </label>
                      <select
                        id={`desk-${doc.id}`}
                        className="input py-1 text-xs"
                        value={desk}
                        onChange={(e) => {
                          const next = e.target.value as
                            | BooksDesk
                            | typeof OTHER_GROUP;
                          setCategory(doc.id, next, kind);
                        }}
                      >
                        {BOOKS_DESKS.map((d) => (
                          <option key={d} value={d}>
                            {BOOKS_DESK_LABEL[d]}
                          </option>
                        ))}
                        <option value={OTHER_GROUP}>Other</option>
                      </select>
                      {desk !== OTHER_GROUP ? (
                        <select
                          className="input py-1 text-xs"
                          value={kind}
                          aria-label="Document type"
                          onChange={(e) =>
                            setCategory(
                              doc.id,
                              desk,
                              e.target.value as BooksDocKind,
                            )
                          }
                        >
                          {BOOKS_DOC_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {BOOKS_DOC_KIND_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {canOpen(doc.blobUrl) ? (
                        <a
                          href={doc.blobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary text-xs"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="badge badge-muted">Stored locally</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

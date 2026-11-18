"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  copyClientDocument,
  updateClientDocumentCategory,
  uploadClientDocument,
} from "@/server/actions/documents";
import {
  BOOKS_DESK_LABEL,
  BOOKS_DESKS,
  BOOKS_DOC_KIND_LABEL,
  BOOKS_DOC_KINDS,
  booksCategory,
  docsForBooksDesk,
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

type ClipboardDoc = {
  documentId: string;
  filename: string;
  kind: BooksDocKind;
};

function canOpenDoc(url: string) {
  return (
    url.startsWith("http") ||
    url.startsWith("/") ||
    url.startsWith("data:")
  );
}

function kindLabel(category: string): string {
  const parsed = parseBooksCategory(category);
  if (parsed?.kind) return BOOKS_DOC_KIND_LABEL[parsed.kind];
  if (/bank_statement/.test(category)) return "Bank statement";
  if (/receipt/.test(category)) return "Receipt";
  if (/invoice/.test(category)) return "Invoice";
  if (category === "accounts" || category === "general") return "Bank statement";
  return "Document";
}

function preserveKind(category: string): BooksDocKind {
  const parsed = parseBooksCategory(category);
  if (parsed?.kind) return parsed.kind;
  if (/receipt/.test(category)) return "receipt";
  if (/invoice/.test(category)) return "invoice";
  if (/other/.test(category)) return "other";
  return "bank_statement";
}

function DeskUploadCard({
  desk,
  clientId,
  clientSlug,
  docs,
  selectedId,
  onSelect,
  onDropDoc,
  dragOver,
  onDragOverChange,
  clipboardHint,
}: {
  desk: BooksDesk;
  clientId: string;
  clientSlug: string;
  docs: ClientDoc[];
  selectedId: string | null;
  onSelect: (doc: ClientDoc) => void;
  onDropDoc: (
    documentId: string,
    toDesk: BooksDesk,
    mode: "move" | "copy",
  ) => void;
  dragOver: boolean;
  onDragOverChange: (desk: BooksDesk | null) => void;
  clipboardHint: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<BooksDocKind>("bank_statement");
  const [pending, start] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);

  const deskDocs = docsForBooksDesk(docs, desk) as ClientDoc[];
  const deskPath =
    desk === "self_assessment"
      ? "self-assessment"
      : desk === "corporation_tax"
        ? "corporation-tax"
        : "vat";
  const deskHref = `/clients/${clientSlug}/${deskPath}`;

  function runUpload(file: File) {
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("clientId", clientId);
        fd.set("category", booksCategory(desk, kind));
        fd.set("file", file);
        await uploadClientDocument(fd);
        setFileName(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch {
        /* freeze */
      }
    });
  }

  return (
    <div
      className={`panel flex h-full flex-col gap-3 p-4 transition ${
        dragOver ? "border-sea bg-sea/5 ring-2 ring-sea/30" : ""
      }`}
      data-bank-desk={desk}
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey || e.altKey
          ? "copy"
          : "move";
        onDragOverChange(desk);
      }}
      onDragLeave={() => onDragOverChange(null)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverChange(null);
        const id = e.dataTransfer.getData("text/document-id");
        if (!id) return;
        const mode =
          e.ctrlKey || e.metaKey || e.altKey || e.dataTransfer.dropEffect === "copy"
            ? "copy"
            : "move";
        onDropDoc(id, desk, mode);
      }}
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-sea">
          {BOOKS_DESK_LABEL[desk]}
        </p>
        <h3 className="mt-1 text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
          Bank
        </h3>
        {clipboardHint ? (
          <p className="mt-1 text-[10px] text-ink-soft">{clipboardHint}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-paper">
        {deskDocs.length > 0 ? (
          <ul className="max-h-52 divide-y divide-line overflow-y-auto">
            {deskDocs.map((doc) => (
              <li
                key={doc.id}
                draggable
                onClick={() => onSelect(doc)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/document-id", doc.id);
                  e.dataTransfer.effectAllowed = "copyMove";
                  onSelect(doc);
                }}
                className={`flex cursor-grab items-start justify-between gap-2 px-3 py-2.5 active:cursor-grabbing ${
                  selectedId === doc.id ? "bg-sea/10" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-ink">
                    {doc.filename}
                  </p>
                  <p className="mt-0.5 text-[10px] text-ink-soft">
                    {kindLabel(doc.category)} ·{" "}
                    {(doc.sizeBytes / 1024).toFixed(0)} KB
                  </p>
                </div>
                {canOpenDoc(doc.blobUrl) ? (
                  <a
                    href={doc.blobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs font-semibold text-sea hover:underline"
                    download={doc.filename}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex min-h-[5.5rem] items-center justify-center px-3 py-4 text-center">
            <p className="text-xs text-ink-soft">
              Paste (Ctrl+V), drop, or upload.
            </p>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2">
        <label className="block text-[11px] text-ink-soft">
          Document type
          <select
            className="input mt-1 w-full text-xs"
            value={kind}
            disabled={pending}
            onChange={(e) => setKind(e.target.value as BooksDocKind)}
          >
            {BOOKS_DOC_KINDS.map((k) => (
              <option key={k} value={k}>
                {BOOKS_DOC_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFileName(f?.name ?? null);
            if (f) runUpload(f);
          }}
        />
        <button
          type="button"
          className="btn btn-primary w-full text-xs"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
        >
          {pending
            ? "Uploading…"
            : fileName
              ? `Uploading ${fileName}…`
              : "Upload document"}
        </button>
        <Link href={deskHref} className="btn btn-ghost w-full text-xs">
          Open {BOOKS_DESK_LABEL[desk]}
        </Link>
      </div>
    </div>
  );
}

/**
 * Books → Bank cards for SA, VAT, and Corporation Tax.
 * Drag to move; Ctrl/Cmd-drag or Ctrl/Cmd+C then Ctrl/Cmd+V to copy.
 */
export function BooksDocumentsWorkspace({
  clientId,
  clientSlug,
  documents,
}: {
  clientId: string;
  clientSlug: string;
  documents: ClientDoc[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [dragOverDesk, setDragOverDesk] = useState<BooksDesk | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardDoc | null>(null);
  const [focusDesk, setFocusDesk] = useState<BooksDesk | null>(null);

  function selectDoc(doc: ClientDoc) {
    setSelectedId(doc.id);
    const parsed = parseBooksCategory(doc.category);
    if (parsed?.desk) setFocusDesk(parsed.desk);
  }

  function moveOrCopy(
    documentId: string,
    toDesk: BooksDesk,
    mode: "move" | "copy",
  ) {
    const doc = documents.find((d) => d.id === documentId);
    if (!doc) return;
    const from = parseBooksCategory(doc.category);
    if (from?.desk === toDesk && mode === "move") return;
    const kind = preserveKind(doc.category);
    const category = booksCategory(toDesk, kind);
    start(async () => {
      try {
        if (mode === "copy") {
          await copyClientDocument({ clientId, documentId, category });
        } else {
          await updateClientDocumentCategory({
            clientId,
            documentId,
            category,
          });
        }
        router.refresh();
      } catch {
        /* freeze */
      }
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "c" || e.key === "C") {
        const doc = documents.find((d) => d.id === selectedId);
        if (!doc) return;
        e.preventDefault();
        setClipboard({
          documentId: doc.id,
          filename: doc.filename,
          kind: preserveKind(doc.category),
        });
        return;
      }

      if (e.key === "v" || e.key === "V") {
        if (!clipboard) return;
        const pasteDesk =
          focusDesk ??
          (document.activeElement instanceof HTMLElement
            ? (document.activeElement
                .closest("[data-bank-desk]")
                ?.getAttribute("data-bank-desk") as BooksDesk | null)
            : null);
        if (!pasteDesk) return;
        e.preventDefault();
        moveOrCopy(clipboard.documentId, pasteDesk, "copy");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // moveOrCopy closes over latest docs/clientId via start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, clipboard, focusDesk, documents, clientId]);

  const clipHint = clipboard
    ? `Copied “${clipboard.filename}” — click a card and Ctrl+V to paste`
    : "Select a file · Ctrl+C copy · Ctrl+V paste · drag to move · Ctrl-drag to copy";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-3xl text-ink md:text-4xl">Bank</h1>
        <p className="mt-1 text-sm text-ink-soft">{clipHint}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {BOOKS_DESKS.map((desk) => (
          <div
            key={desk}
            onFocusCapture={() => setFocusDesk(desk)}
            onMouseDown={() => setFocusDesk(desk)}
          >
            <DeskUploadCard
              desk={desk}
              clientId={clientId}
              clientSlug={clientSlug}
              docs={documents}
              selectedId={selectedId}
              onSelect={selectDoc}
              onDropDoc={moveOrCopy}
              dragOver={dragOverDesk === desk}
              onDragOverChange={setDragOverDesk}
              clipboardHint={
                clipboard && focusDesk === desk
                  ? "Ready to paste (Ctrl+V)"
                  : null
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

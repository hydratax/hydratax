"use client";

import { useRef, useState, useTransition } from "react";
import {
  clearBankTransactions,
  dedupeBankTransactions,
  importBankCsv,
  requestBankConnect,
} from "@/server/actions/bank";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormErrorBanner } from "@/components/forms/form-error-banner";
import { messageFromUnknown } from "@/lib/action-error";
import { BankCategorisedView } from "@/components/forms/bank-categorised-view";
import { recategoriseBankTransactions } from "@/server/actions/bank-recategorise";
import { downloadBankCsv, downloadBankXlsx } from "@/lib/bank-export";

type Tx = {
  id: string;
  dated: string;
  description: string;
  amountPence: number;
  category: string;
  confidence: string;
};

type StatementDoc = {
  id: string;
  filename: string;
  blobUrl: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

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
  const [pending, start] = useTransition();

  function gbp(pence: number) {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(pence / 100);
  }

  const hasTransactions = transactions.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          ref={formRef}
          className="panel gloss-card space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            setMsg(null);
            const fd = new FormData(e.currentTarget);
            fd.set("clientId", clientId);
            start(async () => {
              try {
                const res = await importBankCsv(fd);
                if (!res.ok) {
                  setErr(res.error);
                  return;
                }
                setMsg(res.message);
                setFileName(null);
                formRef.current?.reset();
                router.refresh();
                document
                  .getElementById("categorised-transactions")
                  ?.scrollIntoView({ behavior: "smooth" });
              } catch (error) {
                setErr(messageFromUnknown(error, "Import failed"));
              }
            });
          }}
        >
          <h3 className="display text-xl text-ink">Upload bank statement</h3>
          <p className="text-sm text-ink-soft">
            Prefer CSV or Excel from the bank app — we categorise into fuel,
            insurance, salaries, subcontractors, finance, and other heads.
            A PDF is kept on the client file for review but is not converted
            into lines. Re-uploading a CSV/Excel replaces the previous lines.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              name="file"
              required
              accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                setFileName(file?.name ?? null);
              }}
            />
            <button
              type="button"
              className="btn btn-secondary px-3 py-1.5 text-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </button>
            <span className="text-sm text-ink-soft">
              {fileName ?? "No file chosen"}
            </span>
          </div>
          <FormErrorBanner error={err} />
          {msg && <p className="text-sm text-ok">{msg}</p>}
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Importing…" : "Import & categorise"}
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

      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="display text-xl text-ink">Uploaded statements</h3>
            <p className="mt-1 text-sm text-ink-soft">
              Source files saved to the client file. Also listed under{" "}
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
                  downloadBankXlsx(transactions, "bank-categorised.xlsx")
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
          <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
            {statements.map((doc) => (
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
        )}
        {!hasTransactions && statements.some((d) =>
          d.contentType.includes("pdf") || d.filename.toLowerCase().endsWith(".pdf"),
        ) ? (
          <p className="mt-3 text-sm text-ink-soft">
            Your PDF is saved above. To get a categorised CSV/Excel download,
            upload the bank’s CSV or Excel export (Monzo, Starling, Barclays,
            etc.) — we cannot read transaction lines from a PDF statement yet.
          </p>
        ) : null}
      </div>

      {hasTransactions ? (
        <div className="panel overflow-hidden border-sea/30 bg-sea/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="display text-xl text-ink">Ready for accounts</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {draft.lineCount} categorised lines — review sections below, then
                build the year-end pack. Use Download CSV / Excel above for the
                converted file.
              </p>
            </div>
            <Link
              href={`/clients/${clientSlug}/accounts-pack`}
              className="btn btn-primary shrink-0"
            >
              Open accounts pack →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="panel p-5">
        <h3 className="display text-xl text-ink">One-click tax drafts</h3>
        <p className="mt-1 text-sm text-ink-soft">
          From {draft.lineCount} categorised lines (review before HMRC submit).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-sand/40 p-4">
            <p className="text-xs font-bold uppercase text-ink-soft">
              {draft.selfAssessment.fromCompanyBank
                ? "Director SA income (from company bank)"
                : "Self Assessment draft"}
            </p>
            {draft.selfAssessment.fromCompanyBank ? (
              <p className="mt-1 text-xs text-ink-soft">
                Business turnover feeds Corporation Tax only. Tag director pay
                and dividends below for the director&apos;s personal return.
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
                Open the director&apos;s personal client record for the full
                SA100 return.
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
          <div className="rounded-lg border border-line bg-sand/40 p-4">
            <p className="text-xs font-bold uppercase text-ink-soft">
              Corporation Tax draft
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Turnover</dt>
                <dd className="mono">{gbp(draft.corporationTax.turnoverPence)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Expenses</dt>
                <dd className="mono">{gbp(draft.corporationTax.expensesPence)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Profit draft</dt>
                <dd className="mono">{gbp(draft.corporationTax.profitPence)}</dd>
              </div>
            </dl>
            <Link
              href={`/clients/${clientSlug}/corporation-tax`}
              className="btn btn-primary mt-4 text-sm"
            >
              Open CT600
            </Link>
          </div>
        </div>
      </div>

      <div id="categorised-transactions" className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sand/60 px-4 py-3">
          <div>
            <h3 className="font-semibold text-ink">Categorised transactions</h3>
            <p className="text-xs text-ink-soft">
              Grouped by account head — use Move to reallocate (e.g. Esso → fuel).
            </p>
          </div>
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
                      "Clear all bank transactions for this client? You can re-import the CSV afterwards.",
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
                    setMsg(`Cleared ${res.removed} lines. Upload your CSV again.`);
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
            </div>
          ) : null}
        </div>
        <BankCategorisedView
          clientId={clientId}
          transactions={transactions}
          customCategories={customCategories}
        />
      </div>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  prepareVatReturn,
  prepareVatReturnFromBoxes,
  submitPreparedVatReturn,
} from "@/server/actions/vat";
import { disconnectHmrcAction } from "@/server/actions/hmrc-connect";
import { gatherFraudMetadata } from "@/components/fraud-metadata";
import { HmrcVatConnectModal } from "@/components/forms/hmrc-vat-connect-modal";
import { VAT_BOX_DEFINITIONS } from "@/lib/hmrc/filing-guides";
import { money } from "@/lib/format";
import { FormErrorBanner } from "@/components/forms/form-error-banner";

type Obligation = {
  periodKey: string;
  start: string;
  end: string;
  due: string;
  status: string;
  received?: string;
};

type ReturnRow = {
  id: string;
  periodKey: string;
  status: string;
};

type BoxKey = (typeof VAT_BOX_DEFINITIONS)[number]["key"];

type BoxInputs = Record<BoxKey, string>;

const EMPTY_BOXES: BoxInputs = {
  vatDueSales: "",
  vatDueAcquisitions: "",
  totalVatDue: "",
  vatReclaimedCurrPeriod: "",
  netVatDue: "",
  totalValueSalesExVAT: "",
  totalValuePurchasesExVAT: "",
  totalValueGoodsSuppliedExVAT: "",
  totalAcquisitionsExVAT: "",
};

const BOX_SHORT: Record<BoxKey, string> = {
  vatDueSales: "VAT due on sales and other outputs",
  vatDueAcquisitions: "VAT due on EC acquisitions",
  totalVatDue: "Total VAT due (Box 1 + Box 2)",
  vatReclaimedCurrPeriod: "VAT reclaimed on purchases",
  netVatDue: "Net VAT (Box 3 − Box 4)",
  totalValueSalesExVAT: "Total sales (excl. VAT)",
  totalValuePurchasesExVAT: "Total purchases (excl. VAT)",
  totalValueGoodsSuppliedExVAT: "Goods supplied to EC (excl. VAT)",
  totalAcquisitionsExVAT: "Acquisitions from EC (excl. VAT)",
};

const COMPUTED: BoxKey[] = ["totalVatDue", "netVatDue"];

function parsePounds(raw: string): number {
  const cleaned = raw.replace(/[£,\s]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function penceToField(pence: number): string {
  return (pence / 100).toFixed(2);
}

function prettyDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function downloadCsvTemplate() {
  const header = [
    "box1_vat_due_sales",
    "box2_vat_due_acquisitions",
    "box4_vat_reclaimed",
    "box6_total_sales_ex_vat",
    "box7_total_purchases_ex_vat",
    "box8_goods_to_ec_ex_vat",
    "box9_acquisitions_from_ec_ex_vat",
  ].join(",");
  const sample = "100.00,0.00,40.00,500.00,200.00,0.00,0.00";
  const blob = new Blob([`${header}\n${sample}\n`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hydratax-vat-boxes-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseVatUpload(buffer: ArrayBuffer, filename: string): Partial<BoxInputs> {
  const lower = filename.toLowerCase();
  let rows: Record<string, unknown>[];
  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buffer);
    const book = XLSX.read(text, { type: "string" });
    const sheet = book.Sheets[book.SheetNames[0]!];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  } else {
    const book = XLSX.read(buffer, { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0]!];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }
  if (!rows.length) throw new Error("No rows found in file");
  const row = rows[0]!;
  const get = (...keys: string[]) => {
    const found = Object.entries(row).find(([k]) =>
      keys.some((key) => k.toLowerCase().replace(/[^a-z0-9]/g, "").includes(key)),
    );
    return found ? String(found[1]) : "";
  };
  return {
    vatDueSales: get("box1", "vatduesales", "vatdueonsales") || "",
    vatDueAcquisitions: get("box2", "vatdueacquisitions") || "",
    vatReclaimedCurrPeriod: get("box4", "vatreclaimed") || "",
    totalValueSalesExVAT: get("box6", "totalsales") || "",
    totalValuePurchasesExVAT: get("box7", "totalpurchases") || "",
    totalValueGoodsSuppliedExVAT: get("box8", "goodssupplied") || "",
    totalAcquisitionsExVAT: get("box9", "acquisitions") || "",
  };
}

export function VatReturnsWorkspace({
  clientId,
  clientName,
  vrn,
  connected,
  signedIn,
  obligations,
  returns,
}: {
  clientId: string;
  clientName: string;
  vrn: string | null;
  connected: boolean;
  signedIn: boolean;
  obligations: Obligation[];
  returns: ReturnRow[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [pending, start] = useTransition();
  const openObligations = obligations.filter((o) => o.status === "O");
  const [selected, setSelected] = useState(
    openObligations[0]?.periodKey ?? obligations[0]?.periodKey ?? "",
  );
  const [boxes, setBoxes] = useState<BoxInputs>({ ...EMPTY_BOXES });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);

  const obligation = obligations.find((o) => o.periodKey === selected);

  const derived = useMemo(() => {
    const b1 = parsePounds(boxes.vatDueSales);
    const b2 = parsePounds(boxes.vatDueAcquisitions);
    const b4 = parsePounds(boxes.vatReclaimedCurrPeriod);
    const total = b1 + b2;
    const net = Math.abs(total - b4);
    return {
      totalVatDue: penceToField(total),
      netVatDue: penceToField(net),
      pence: {
        vatDueSales: b1,
        vatDueAcquisitions: b2,
        totalVatDue: total,
        vatReclaimedCurrPeriod: b4,
        netVatDue: net,
        totalValueSalesExVAT: parsePounds(boxes.totalValueSalesExVAT),
        totalValuePurchasesExVAT: parsePounds(boxes.totalValuePurchasesExVAT),
        totalValueGoodsSuppliedExVAT: parsePounds(
          boxes.totalValueGoodsSuppliedExVAT,
        ),
        totalAcquisitionsExVAT: parsePounds(boxes.totalAcquisitionsExVAT),
      },
    };
  }, [boxes]);

  function setBox(key: BoxKey, value: string) {
    if (COMPUTED.includes(key)) return;
    setBoxes((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-sea">
          {clientName}
        </p>
        <h1 className="display mt-1 text-4xl text-ink md:text-5xl">
          VAT Returns
        </h1>
        <p className="mt-1 text-ink-soft">
          File MTD VAT to HMRC
          {vrn ? ` · VRN ${vrn}` : " · connect to load obligations"}
          {connected ? " · connected" : ""}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Periods sidebar */}
        <aside className="space-y-4">
          <div className="panel p-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
              VAT periods
            </h2>
            {connected ? (
              <ul className="mt-3 space-y-2">
                {obligations.map((o) => {
                  const active = o.periodKey === selected;
                  return (
                    <li key={o.periodKey}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(o.periodKey);
                          setMessage(null);
                          setError(null);
                        }}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                          active
                            ? "border-sea bg-sea/5"
                            : "border-line hover:border-sea/40"
                        }`}
                      >
                        <span className="font-semibold text-ink">
                          {o.periodKey}
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-soft">
                          {prettyDate(o.start)} – {prettyDate(o.end)}
                        </span>
                        <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-sea">
                          {o.status === "O" ? "Open" : "Fulfilled"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">
                After you connect, your real VAT obligation periods come
                straight from HMRC — nothing to set up by hand.
              </p>
            )}
          </div>

          {returns.length > 0 && (
            <div className="panel p-4">
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                Submitted
              </h2>
              <ul className="mt-3 divide-y divide-line text-sm">
                {returns.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="font-semibold">{r.periodKey}</span>
                    <span className="badge badge-ok">{r.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Main filing card */}
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="display text-2xl text-ink">
                File next VAT return to HMRC
              </h2>
              {obligation && (
                <p className="mt-1 text-sm text-ink-soft">
                  Period {obligation.periodKey}: {prettyDate(obligation.start)}{" "}
                  – {prettyDate(obligation.end)} · due{" "}
                  {prettyDate(obligation.due)}
                </p>
              )}
            </div>
            {connected ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-ok">HMRC connected</span>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await disconnectHmrcAction(clientId);
                      router.refresh();
                    })
                  }
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setConnectOpen(true)}
              >
                Connect to HMRC
              </button>
            )}
          </div>

          <div className="grid gap-0 lg:grid-cols-2">
            {/* Digital record */}
            <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                Create digital record
              </h3>
              <ul className="mt-4 space-y-2">
                {VAT_BOX_DEFINITIONS.map((def) => {
                  const computed = COMPUTED.includes(def.key);
                  const value = computed
                    ? derived[def.key as "totalVatDue" | "netVatDue"]
                    : boxes[def.key];
                  return (
                    <li
                      key={def.key}
                      className={`flex items-center gap-3 rounded-xl px-2 py-2 ${
                        computed ? "bg-sea/5" : ""
                      }`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sea text-xs font-bold text-white">
                        {def.id}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-ink">
                        {BOX_SHORT[def.key]}
                      </span>
                      <input
                        className="input mono w-[7.5rem] shrink-0 py-1.5 text-right text-sm"
                        inputMode="decimal"
                        readOnly={computed}
                        value={value}
                        placeholder="0.00"
                        onChange={(e) => setBox(def.key, e.target.value)}
                        aria-label={`Box ${def.id}`}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Upload */}
            <div className="p-5">
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-ink-soft">
                Or upload a file
              </h3>
              <label className="mt-4 flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-sea/50 bg-sea/[0.03] px-6 py-10 text-center transition hover:border-sea hover:bg-sea/5">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setError(null);
                    start(async () => {
                      try {
                        const partial = parseVatUpload(
                          await file.arrayBuffer(),
                          file.name,
                        );
                        setBoxes((prev) => ({ ...prev, ...partial }));
                        setUploadName(file.name);
                        setMessage(`Loaded figures from ${file.name}`);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not read file",
                        );
                      }
                    });
                  }}
                />
                <span className="flex size-12 items-center justify-center rounded-full bg-sea/10 text-sea">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                  </svg>
                </span>
                <span className="text-sm text-ink">
                  Drag and drop your file or{" "}
                  <span className="font-semibold text-sea">browse</span>
                </span>
                <span className="text-xs text-ink-soft">
                  CSV or Excel (.xls, .xlsx)
                  {uploadName ? ` · ${uploadName}` : ""}
                </span>
              </label>
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-sea underline-offset-2 hover:underline"
                onClick={downloadCsvTemplate}
              >
                Download CSV template
              </button>

              <div className="mt-8 space-y-2 border-t border-line pt-5">
                <button
                  type="button"
                  className="btn btn-secondary w-full text-sm"
                  disabled={pending || !obligation}
                  onClick={() =>
                    start(async () => {
                      if (!obligation) return;
                      setError(null);
                      try {
                        const draft = await prepareVatReturn({
                          clientId,
                          periodKey: obligation.periodKey,
                          periodStart: obligation.start,
                          periodEnd: obligation.end,
                        });
                        const b = draft.boxes as Record<BoxKey, number>;
                        setBoxes({
                          vatDueSales: penceToField(b.vatDueSales),
                          vatDueAcquisitions: penceToField(
                            b.vatDueAcquisitions,
                          ),
                          totalVatDue: penceToField(b.totalVatDue),
                          vatReclaimedCurrPeriod: penceToField(
                            b.vatReclaimedCurrPeriod,
                          ),
                          netVatDue: penceToField(b.netVatDue),
                          totalValueSalesExVAT: penceToField(
                            b.totalValueSalesExVAT,
                          ),
                          totalValuePurchasesExVAT: penceToField(
                            b.totalValuePurchasesExVAT,
                          ),
                          totalValueGoodsSuppliedExVAT: penceToField(
                            b.totalValueGoodsSuppliedExVAT,
                          ),
                          totalAcquisitionsExVAT: penceToField(
                            b.totalAcquisitionsExVAT,
                          ),
                        });
                        setMessage("Drafted boxes from client books");
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not draft from books",
                        );
                      }
                    })
                  }
                >
                  Fill from books
                </button>
                <p className="text-xs text-ink-soft">
                  Net VAT due:{" "}
                  <span className="mono font-semibold text-ink">
                    {money(derived.pence.netVatDue)}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-line bg-sand/30 px-5 py-4">
            <FormErrorBanner error={error} />
            {message && (
              <p className="text-sm font-semibold text-ok">{message}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !obligation || !connected}
                onClick={() =>
                  start(async () => {
                    if (!obligation) return;
                    setError(null);
                    try {
                      await prepareVatReturnFromBoxes({
                        clientId,
                        periodKey: obligation.periodKey,
                        periodStart: obligation.start,
                        periodEnd: obligation.end,
                        boxes: derived.pence,
                      });
                      const fraudMetadata = gatherFraudMetadata();
                      const res = await submitPreparedVatReturn({
                        clientId,
                        periodKey: obligation.periodKey,
                        periodStart: obligation.start,
                        periodEnd: obligation.end,
                        fraudMetadata,
                      });
                      const bundle =
                        (res as { hmrcFormBundleNumber?: string })
                          .hmrcFormBundleNumber ??
                        (res as { result?: { hmrcFormBundleNumber?: string } })
                          .result?.hmrcFormBundleNumber ??
                        "accepted";
                      setMessage(`Submitted to HMRC · ${bundle}`);
                      router.refresh();
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Submission failed",
                      );
                    }
                  })
                }
              >
                {pending
                  ? "Submitting…"
                  : connected
                    ? "Submit VAT return to HMRC"
                    : "Connect to HMRC to submit"}
              </button>
              {!connected && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConnectOpen(true)}
                >
                  Connect to HMRC
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      <HmrcVatConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        clientId={clientId}
        initialVrn={vrn}
        signedIn={signedIn}
      />
    </div>
  );
}

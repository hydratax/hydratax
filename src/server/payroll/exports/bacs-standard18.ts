/**
 * Bacs Standard 18 payment file (Direct Credits) — file generation only.
 *
 * Layout follows common bank Standard 18 MIG guidance (VOL1 → HDR1 → HDR2 →
 * UHL1 → credit rows → CONTRA → EOF1 → EOF2 → UTL1). No live bureau submit.
 *
 * Required originator fields (Service User Number, paying sort/account/name)
 * come from payroll desk settings — never invent SUN credentials.
 *
 * https://www.bacs.co.uk/ — processing calendar & scheme rules
 */

export type BacsOriginator = {
  /** 6-digit Service User Number assigned by Bacs / bureau. */
  serviceUserNumber: string;
  /** Paying account sort code (6 digits). */
  sortCode: string;
  /** Paying account number (8 digits). */
  accountNumber: string;
  /** Originator name on credits / CONTRA (max 18 chars). */
  accountName: string;
  /** Optional 6-char serial (defaults from processing day). */
  fileSerial?: string;
};

export type BacsPaymentRow = {
  sortCode: string;
  accountNumber: string;
  accountName: string;
  /** Net pay in integer pence. */
  amountPence: number;
  /** Payment reference shown to beneficiary (max 18). */
  reference: string;
};

export type BacsBuildInput = {
  originator: BacsOriginator;
  payments: BacsPaymentRow[];
  /** Processing day (ISO YYYY-MM-DD) — banking day before value day. */
  processingDateIso: string;
  /** File creation date (ISO); defaults to processing date. */
  creationDateIso?: string;
  /** Include PAYE free-format marker `/xxx` on credit rows (default true). */
  payeMarker?: boolean;
};

/** Digits-only, fixed length (pad left with zeros if short). */
export function digitsOnly(raw: string | null | undefined, len: number): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length > len) return d.slice(0, len);
  return d.padStart(len, "0");
}

/** True when sort (6) + account (8) look like UK domestic numbers. */
export function isUkDomesticBankAccount(
  sortCode: string | null | undefined,
  accountNumber: string | null | undefined,
): boolean {
  const sc = String(sortCode ?? "").replace(/\D/g, "");
  const ac = String(accountNumber ?? "").replace(/\D/g, "");
  return /^\d{6}$/.test(sc) && /^\d{8}$/.test(ac);
}

/** Originator ready for a Standard 18 credit file. */
export function bacsOriginatorReady(
  originator: Partial<BacsOriginator> | null | undefined,
): boolean {
  if (!originator) return false;
  const sun = String(originator.serviceUserNumber ?? "").replace(/\D/g, "");
  if (!/^\d{6}$/.test(sun)) return false;
  if (
    !isUkDomesticBankAccount(originator.sortCode, originator.accountNumber)
  ) {
    return false;
  }
  const name = String(originator.accountName ?? "").trim();
  return name.length > 0;
}

function padRight(s: string, len: number): string {
  const t = s.slice(0, len);
  return t + " ".repeat(Math.max(0, len - t.length));
}

function padLeft(s: string, len: number, ch = "0"): string {
  const t = s.slice(0, len);
  return ch.repeat(Math.max(0, len - t.length)) + t;
}

/** Bacs date: space + YY + day-of-year (001–366). */
export function bacsJulianDate(isoDate: string): string {
  const [yStr, mStr, dStr] = isoDate.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const utc = Date.UTC(y, m - 1, d);
  const start = Date.UTC(y, 0, 1);
  const dayOfYear = Math.floor((utc - start) / 86_400_000) + 1;
  const yy = String(y).slice(-2);
  return ` ${yy}${String(dayOfYear).padStart(3, "0")}`;
}

/**
 * Next Mon–Fri on or after isoDate (simple UK banking-day approx —
 * excludes weekends only; bureau calendar still applies at submit).
 */
export function nextBankingDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 10; i++) {
    const dow = dt.getUTCDay(); // 0 Sun … 6 Sat
    if (dow !== 0 && dow !== 6) {
      return dt.toISOString().slice(0, 10);
    }
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return isoDate;
}

/** Sanitise to Bacs-safe uppercase alphanumeric + limited punctuation. */
export function bacsCharset(raw: string, len: number): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-\/&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return padRight(cleaned, len);
}

/** PAYE free-format: '/' + 3 chars derived from reference (deterministic). */
function payeFreeFormat(reference: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seed = reference.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "PAY";
  let s = "/";
  for (let i = 0; i < 3; i++) {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    s += alphabet[code % alphabet.length]!;
  }
  return s;
}

function creditRecord(
  originator: BacsOriginator,
  row: BacsPaymentRow,
  payeMarker: boolean,
): string {
  const destSc = digitsOnly(row.sortCode, 6);
  const destAc = digitsOnly(row.accountNumber, 8);
  const origSc = digitsOnly(originator.sortCode, 6);
  const origAc = digitsOnly(originator.accountNumber, 8);
  const amount = padLeft(String(Math.max(0, Math.floor(row.amountPence))), 11);
  const userName = bacsCharset(originator.accountName, 18);
  const ref = bacsCharset(row.reference || "SALARY", 18);
  const destName = bacsCharset(row.accountName, 18);
  const free = payeMarker ? payeFreeFormat(row.reference || "SALARY") : "    ";
  return (
    destSc +
    destAc +
    "0" +
    "99" +
    origSc +
    origAc +
    free +
    amount +
    userName +
    ref +
    destName
  );
}

function contraRecord(originator: BacsOriginator, totalPence: number): string {
  const sc = digitsOnly(originator.sortCode, 6);
  const ac = digitsOnly(originator.accountNumber, 8);
  const amount = padLeft(String(Math.max(0, Math.floor(totalPence))), 11);
  const userName = bacsCharset(originator.accountName, 18);
  return (
    sc +
    ac +
    "0" +
    "17" +
    sc +
    ac +
    "    " +
    amount +
    userName +
    padRight("CONTRA", 18) +
    userName
  );
}

/**
 * Build a single-processing-day Standard 18 Direct Credit file.
 * Returns null when originator incomplete or no payable rows.
 */
export function buildBacsStandard18File(
  input: BacsBuildInput,
): string | null {
  if (!bacsOriginatorReady(input.originator)) return null;
  const payments = input.payments.filter(
    (p) =>
      p.amountPence > 0 &&
      isUkDomesticBankAccount(p.sortCode, p.accountNumber),
  );
  if (!payments.length) return null;

  const sun = digitsOnly(input.originator.serviceUserNumber, 6);
  const processing = nextBankingDay(input.processingDateIso);
  const creation = nextBankingDay(
    input.creationDateIso ?? input.processingDateIso,
  );
  const createJ = bacsJulianDate(creation);
  // Expiration after processing day (+30 calendar days approx via julian)
  const expDt = new Date(`${processing}T12:00:00Z`);
  expDt.setUTCDate(expDt.getUTCDate() + 30);
  const expJ = bacsJulianDate(expDt.toISOString().slice(0, 10));
  const procJ = bacsJulianDate(processing);

  const serialRaw = (input.originator.fileSerial ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  const serial = padLeft(serialRaw || processing.replace(/-/g, "").slice(-6), 6, "0");

  const vol1 =
    "VOL1" +
    padLeft(serial, 6, " ") +
    " " +
    " ".repeat(20) +
    " ".repeat(6) +
    "    " +
    sun +
    "    " +
    " ".repeat(28) +
    "1";

  const hdr1 =
    "HDR1" +
    "A" +
    sun +
    "S" +
    "  " +
    " " +
    sun +
    padLeft(serial, 6, " ") +
    "0001" +
    "0001" +
    "    " +
    "  " +
    createJ +
    expJ +
    " " +
    "000000" +
    " ".repeat(13) +
    " ".repeat(7);

  const hdr2 =
    "HDR2" + "F" + "02000" + "00100" + " ".repeat(35) + "00" + " ".repeat(28);

  const uhl1 =
    "UHL1" +
    procJ +
    "999999" +
    "    " +
    "00" +
    "000000" +
    "1 DAILY  " +
    "001" +
    " ".repeat(7) +
    " ".repeat(7) +
    " ".repeat(26);

  const payeMarker = input.payeMarker !== false;
  const dataRows = payments.map((p) =>
    creditRecord(input.originator, p, payeMarker),
  );
  const total = payments.reduce((s, p) => s + Math.floor(p.amountPence), 0);
  const contra = contraRecord(input.originator, total);

  const eof1 =
    "EOF1" +
    "A" +
    sun +
    "S" +
    "  " +
    " " +
    sun +
    padLeft(serial, 6, " ") +
    "0001" +
    "0001" +
    "    " +
    "  " +
    createJ +
    expJ +
    " " +
    "000000" +
    " ".repeat(13) +
    " ".repeat(7);

  const eof2 =
    "EOF2" + "F" + "02000" + "00100" + " ".repeat(35) + "00" + " ".repeat(28);

  // UTL1: monetary total (11) + credit count (7) + debit count (7) — padded to 80
  const creditCount = payments.length;
  const debitCount = 1; // CONTRA
  const utl1 =
    "UTL1" +
    padLeft(String(total), 13) +
    padLeft(String(creditCount), 7) +
    padLeft(String(debitCount), 7) +
    " ".repeat(49);

  const lines = [
    vol1.slice(0, 80),
    hdr1.slice(0, 80),
    hdr2.slice(0, 80),
    uhl1.slice(0, 80),
    ...dataRows.map((r) => r.slice(0, 100)),
    contra.slice(0, 100),
    eof1.slice(0, 80),
    eof2.slice(0, 80),
    utl1.slice(0, 80),
  ];

  // Standard 18 commonly uses CRLF; ensure each label/data line exact width.
  return lines.map((l) => l.padEnd(l.length <= 80 ? 80 : 100, " ")).join("\r\n") + "\r\n";
}

/** Build AUDDIS new-instruction rows (0N) — optional companion file, no amounts/CONTRA. */
export function buildAuddisNewInstructionsFile(input: {
  originator: BacsOriginator;
  mandates: Array<{
    sortCode: string;
    accountNumber: string;
    accountName: string;
    reference: string;
  }>;
  processingDateIso: string;
}): string | null {
  if (!bacsOriginatorReady(input.originator)) return null;
  const rows = input.mandates.filter((m) =>
    isUkDomesticBankAccount(m.sortCode, m.accountNumber),
  );
  if (!rows.length) return null;

  // Re-use credit file shell with 0N rows and no CONTRA — build manually.
  const sun = digitsOnly(input.originator.serviceUserNumber, 6);
  const processing = nextBankingDay(input.processingDateIso);
  const createJ = bacsJulianDate(processing);
  const expDt = new Date(`${processing}T12:00:00Z`);
  expDt.setUTCDate(expDt.getUTCDate() + 30);
  const expJ = bacsJulianDate(expDt.toISOString().slice(0, 10));
  const procJ = bacsJulianDate(processing);
  const serial = padLeft(processing.replace(/-/g, "").slice(-6), 6, "0");
  const origSc = digitsOnly(input.originator.sortCode, 6);
  const origAc = digitsOnly(input.originator.accountNumber, 8);
  const userName = bacsCharset(input.originator.accountName, 18);

  const vol1 =
    "VOL1" +
    padLeft(serial, 6, " ") +
    " " +
    " ".repeat(20) +
    " ".repeat(6) +
    "    " +
    sun +
    "    " +
    " ".repeat(28) +
    "1";
  const hdr1 =
    "HDR1" +
    "A" +
    sun +
    "S  " +
    " " +
    sun +
    padLeft(serial, 6, " ") +
    "00010001    " +
    "  " +
    createJ +
    expJ +
    " 000000" +
    " ".repeat(20);
  const hdr2 =
    "HDR2F0200000100" + " ".repeat(35) + "00" + " ".repeat(28);
  const uhl1 =
    "UHL1" +
    procJ +
    "999999    00" +
    "000000" +
    "1 DAILY  " +
    "001" +
    " ".repeat(40);

  const data = rows.map((m) => {
    const destSc = digitsOnly(m.sortCode, 6);
    const destAc = digitsOnly(m.accountNumber, 8);
    return (
      destSc +
      destAc +
      "0" +
      "0N" +
      origSc +
      origAc +
      "    " +
      padLeft("0", 11) +
      userName +
      bacsCharset(m.reference || "MANDATE", 18) +
      bacsCharset(m.accountName, 18)
    );
  });

  const eof1 =
    "EOF1" +
    "A" +
    sun +
    "S  " +
    " " +
    sun +
    padLeft(serial, 6, " ") +
    "00010001    " +
    "  " +
    createJ +
    expJ +
    " 000000" +
    " ".repeat(20);
  const eof2 =
    "EOF2F0200000100" + " ".repeat(35) + "00" + " ".repeat(28);
  const utl1 =
    "UTL1" +
    padLeft("0", 13) +
    padLeft(String(rows.length), 7) +
    padLeft("0", 7) +
    " ".repeat(49);

  const lines = [
    vol1.slice(0, 80),
    hdr1.slice(0, 80),
    hdr2.slice(0, 80),
    uhl1.slice(0, 80),
    ...data.map((r) => r.slice(0, 100)),
    eof1.slice(0, 80),
    eof2.slice(0, 80),
    utl1.slice(0, 80),
  ];
  return lines.map((l) => l.padEnd(l.length <= 80 ? 80 : 100, " ")).join("\r\n") + "\r\n";
}

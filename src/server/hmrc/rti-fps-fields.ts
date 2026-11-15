import type { PayFrequency } from "@/server/hmrc/payroll";

/** HMRC HoursWorked code (FPS Payment). */
export type HoursWorkedCode = "A" | "B" | "C" | "D" | "E";

/** RTI tax month 1–12 from payment date (period ending on the 5th). */
export function rtiTaxMonthNo(isoDate: string): number {
  const [, mStr, dStr] = isoDate.split("-");
  const m = Number(mStr);
  const d = Number(dStr);
  let month = m - 3;
  if (d < 6) month -= 1;
  if (month <= 0) month += 12;
  return month;
}

/** RTI tax week 1–53 from payment date (tax year starts 6 April). */
export function rtiTaxWeekNo(isoDate: string): number {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const startYear = m < 4 || (m === 4 && day < 6) ? y - 1 : y;
  const start = Date.UTC(startYear, 3, 6); // 6 April
  const ms = d.getTime() - start;
  const week = Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
  if (week < 1) return 1;
  if (week > 53) return 53;
  // Schema allows 1–49, 50–54 except 55; 53 ok, 52 ok; pattern [1-9]|[1-4][0-9]|5[0-46]
  if (week === 55) return 54;
  return week;
}

export function hoursWorkedCode(hoursPerWeekHundredths: number): HoursWorkedCode {
  const h = (hoursPerWeekHundredths || 0) / 100;
  if (h <= 0) return "E";
  if (h < 16) return "A";
  if (h < 24) return "B";
  if (h < 30) return "C";
  return "D";
}

/** Sanitize forename/surname to FPS CharsetD-ish (letters, space, hyphen, apostrophe). */
export function fpsNameToken(raw: string, max = 35): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z \-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const out = cleaned.slice(0, max);
  if (!out || !/^[A-Za-z]/.test(out)) {
    throw new Error(
      `Employee name "${raw}" is not valid for HMRC FPS (must start with a letter).`,
    );
  }
  return out;
}

const UK_POSTCODE =
  /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i;

/** Optional FPS Address from free-text employee address. */
export function fpsAddressFromText(address: string | null | undefined): {
  lines: string[];
  ukPostcode?: string;
} | null {
  if (!address?.trim()) return null;
  const raw = address.trim();
  const pcMatch = raw.match(UK_POSTCODE);
  const ukPostcode = pcMatch
    ? pcMatch[1].toUpperCase().replace(/\s+/, " ")
    : undefined;
  const withoutPc = ukPostcode
    ? raw.replace(pcMatch![0], "").replace(/[,\s]+$/g, "").trim()
    : raw;
  const parts = withoutPc
    .split(/[\n,]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.slice(0, 35))
    .filter((p) => /^[A-Za-z0-9]/.test(p));
  if (!parts.length && !ukPostcode) return null;
  return {
    lines: parts.slice(0, 4),
    ukPostcode: ukPostcode
      ? ukPostcode.includes(" ")
        ? ukPostcode
        : `${ukPostcode.slice(0, -3)} ${ukPostcode.slice(-3)}`
      : undefined,
  };
}

/**
 * Approximate YTD NI earnings bands from cumulative NI'able pay.
 * Period thresholds × periods elapsed; allocate ytdGross into LEL / PT / UEL bands.
 * Not a full HMRC NI engine — enough for schema-valid FPS on ordinary Category A pay.
 */
export function approximateNiBandsYtd(opts: {
  frequency: PayFrequency;
  ytdGrossPence: number;
  periodsElapsed: number;
  lelPeriodPence: number;
  ptPeriodPence: number;
  uelPeriodPence: number;
}): {
  atLelYtdPence: number;
  lelToPtYtdPence: number;
  ptToUelYtdPence: number;
} {
  const n = Math.max(1, opts.periodsElapsed);
  const lelCap = opts.lelPeriodPence * n;
  const ptCap = opts.ptPeriodPence * n;
  const uelCap = opts.uelPeriodPence * n;
  let rem = Math.max(0, opts.ytdGrossPence);
  const atLel = Math.min(rem, lelCap);
  rem -= atLel;
  const lelToPt = Math.min(rem, Math.max(0, ptCap - lelCap));
  rem -= lelToPt;
  const ptToUel = Math.min(rem, Math.max(0, uelCap - ptCap));
  return {
    // AtLELYTD is whole pounds in the XSD
    atLelYtdPence: Math.floor(atLel / 100) * 100,
    lelToPtYtdPence: lelToPt,
    ptToUelYtdPence: ptToUel,
  };
}

export function periodsElapsedInTaxYear(
  frequency: PayFrequency,
  payDate: string,
): number {
  if (frequency === "W1") return rtiTaxWeekNo(payDate);
  return rtiTaxMonthNo(payDate);
}

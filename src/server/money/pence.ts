/**
 * Integer pence currency engine — never use floating-point for money.
 * £1,000.00 is stored as 100000.
 */

declare const __penceBrand: unique symbol;

export type Pence = number & { readonly [__penceBrand]: true };

export function pence(n: number): Pence {
  if (!Number.isInteger(n)) {
    throw new Error(`Pence must be an integer, received ${n}`);
  }
  return n as Pence;
}

export function poundsToPence(pounds: string | number): Pence {
  const s = typeof pounds === "number" ? pounds.toFixed(2) : pounds.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
    throw new Error(`Invalid pound amount: ${pounds}`);
  }
  const negative = s.startsWith("-");
  const [whole, frac = "00"] = s.replace("-", "").split(".");
  const frac2 = (frac + "00").slice(0, 2);
  const value = Number.parseInt(whole, 10) * 100 + Number.parseInt(frac2, 10);
  return pence(negative ? -value : value);
}

export function penceToPounds(amount: Pence | number): string {
  const n = Number(amount);
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function formatGBP(amount: Pence | number): string {
  const n = Number(amount);
  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n / 100);
  return formatted;
}

export function addPence(...amounts: Array<Pence | number>): Pence {
  return pence(amounts.reduce<number>((sum, a) => sum + Number(a), 0));
}

export function subtractPence(a: Pence | number, b: Pence | number): Pence {
  return pence(Number(a) - Number(b));
}

export function multiplyPence(amount: Pence | number, factor: number): Pence {
  if (!Number.isInteger(factor)) {
    // Round half-away-from-zero to nearest penny for tax-safe multiplication
    const raw = Number(amount) * factor;
    const rounded = raw >= 0 ? Math.round(raw) : -Math.round(-raw);
    return pence(rounded);
  }
  return pence(Number(amount) * factor);
}

/** VAT amount from net at a rate expressed in basis points (2000 = 20%). */
export function vatOnNet(netPence: Pence | number, rateBps: number): Pence {
  return multiplyPence(netPence, rateBps / 10_000);
}

export function grossFromNet(netPence: Pence | number, rateBps: number): Pence {
  return addPence(netPence, vatOnNet(netPence, rateBps));
}

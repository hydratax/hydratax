/**
 * bankbee — per-bank layout profile.
 * Extend when a real statement fails; keep detect patterns tight.
 */

export type BankProfileId =
  | "monzo"
  | "starling"
  | "hsbc"
  | "barclays"
  | "lloyds"
  | "natwest"
  | "santander"
  | "nationwide"
  | "metro"
  | "revolut"
  | "amex"
  | "generic";

export type MoneyColumnHint =
  | "single_amount"
  | "out_then_in"
  | "in_then_out"
  | "amount_then_balance";

export type BankProfile = {
  id: BankProfileId;
  label: string;
  /** Match against the first ~2.5k chars of statement text */
  detect: RegExp[];
  moneyColumns: MoneyColumnHint;
  /**
   * When a row has an unsigned amount and narrative is ambiguous,
   * treat as outflow (typical current-account PDF) or inflow.
   */
  defaultUnsignedAs: "outflow" | "inflow";
};

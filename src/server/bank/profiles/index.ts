import type { BankProfile, BankProfileId } from "@/server/bank/profiles/types";

export type { BankProfile, BankProfileId, MoneyColumnHint } from "@/server/bank/profiles/types";

/**
 * Ordered bankbee profiles — first detect match wins.
 * Add new banks here + a scar in `.cursor/skills/bankbee/reference.md`.
 */
export const BANK_PROFILES: BankProfile[] = [
  {
    id: "monzo",
    label: "Monzo",
    detect: [/monzo/i],
    moneyColumns: "single_amount",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "starling",
    label: "Starling",
    detect: [/starling bank|www\.starlingbank\.com/i],
    moneyColumns: "single_amount",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "natwest",
    label: "NatWest",
    detect: [/natwest|national westminster/i],
    moneyColumns: "amount_then_balance",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "hsbc",
    label: "HSBC",
    detect: [/\bhsbc\b/i],
    moneyColumns: "amount_then_balance",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "barclays",
    label: "Barclays",
    detect: [/barclays/i],
    moneyColumns: "out_then_in",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "lloyds",
    label: "Lloyds",
    detect: [/lloyds bank|lloyds banking/i],
    moneyColumns: "out_then_in",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "santander",
    label: "Santander",
    detect: [/santander/i],
    moneyColumns: "out_then_in",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "nationwide",
    label: "Nationwide",
    detect: [/nationwide/i],
    moneyColumns: "amount_then_balance",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "metro",
    label: "Metro Bank",
    detect: [/metro bank/i],
    moneyColumns: "single_amount",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "revolut",
    label: "Revolut",
    detect: [/revolut/i],
    moneyColumns: "single_amount",
    defaultUnsignedAs: "outflow",
  },
  {
    id: "amex",
    label: "American Express",
    detect: [/american express|\bamex\b/i],
    moneyColumns: "single_amount",
    defaultUnsignedAs: "outflow",
  },
];

export const GENERIC_PROFILE: BankProfile = {
  id: "generic",
  label: "UK bank (generic)",
  detect: [],
  moneyColumns: "amount_then_balance",
  defaultUnsignedAs: "outflow",
};

export function detectBankProfile(text: string): BankProfile {
  const head = text.slice(0, 2500);
  for (const profile of BANK_PROFILES) {
    if (profile.detect.some((re) => re.test(head))) return profile;
  }
  return GENERIC_PROFILE;
}

export function profileById(id: BankProfileId | string | null | undefined): BankProfile {
  if (!id || id === "generic") return GENERIC_PROFILE;
  return BANK_PROFILES.find((p) => p.id === id) ?? GENERIC_PROFILE;
}

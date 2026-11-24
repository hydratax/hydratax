import { describe, expect, it } from "vitest";
import {
  bankKey,
  encodeBankTaggedDescription,
  extractBankNameFromFilename,
  parseBankTaggedDescription,
  transactionDedupeKey,
} from "@/lib/bank/bank-tx-meta";

describe("extractBankNameFromFilename", () => {
  it("reads em-dash nicknames", () => {
    expect(extractBankNameFromFilename("Tide — Statement_2_2024.pdf")).toBe(
      "Tide",
    );
  });

  it("reads underscore nicknames", () => {
    expect(extractBankNameFromFilename("Tide _ Statement_2_2024.pdf")).toBe(
      "Tide",
    );
  });
});

describe("bank tagged description", () => {
  it("round-trips bank name", () => {
    const raw = encodeBankTaggedDescription("O2 DD", "Tide");
    const parsed = parseBankTaggedDescription(raw);
    expect(parsed.description).toBe("O2 DD");
    expect(parsed.bankName).toBe("Tide");
    expect(bankKey(parsed.bankName)).toBe("tide");
  });

  it("dedupes ignoring bank tags", () => {
    const a = transactionDedupeKey(
      "2024-02-01",
      encodeBankTaggedDescription("O2 DD", "Tide"),
      -2300,
    );
    const b = transactionDedupeKey("2024-02-01", "O2 DD", -2300);
    expect(a).toBe(b);
  });

  it("renames bank tag without changing bare description", () => {
    const raw = encodeBankTaggedDescription("O2 DD", "Unnamed");
    const renamed = encodeBankTaggedDescription(
      parseBankTaggedDescription(raw).description,
      "Tide",
    );
    const parsed = parseBankTaggedDescription(renamed);
    expect(parsed.description).toBe("O2 DD");
    expect(parsed.bankName).toBe("Tide");
  });
});

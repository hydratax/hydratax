import { describe, expect, it } from "vitest";
import {
  encodeManualBankDescription,
  parseBankDescriptionMeta,
} from "./manual-tx-meta";

describe("manual bank description meta", () => {
  it("round-trips description and notes", () => {
    const raw = encodeManualBankDescription("Cash sale", "Paid in notes at till");
    const meta = parseBankDescriptionMeta(raw);
    expect(meta.manual).toBe(true);
    expect(meta.description).toBe("Cash sale");
    expect(meta.notes).toBe("Paid in notes at till");
  });

  it("keeps plain bank descriptions unchanged", () => {
    const meta = parseBankDescriptionMeta("TESCO STORES 1234");
    expect(meta.manual).toBe(false);
    expect(meta.description).toBe("TESCO STORES 1234");
    expect(meta.notes).toBeNull();
  });
});

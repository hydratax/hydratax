import { describe, expect, it } from "vitest";
import {
  amendmentCardLabel,
  canCreateAmendment,
  nextAmendmentIndex,
  parseVatPeriodKeyAmendment,
  vatPeriodKeyWithAmendment,
} from "@/lib/amendment-revision";

describe("amendment-revision", () => {
  it("labels AR cards", () => {
    expect(amendmentCardLabel("2025-26", 0)).toBe("2025-26");
    expect(amendmentCardLabel("2025-26", 1)).toBe("2025-26 AR 1");
    expect(amendmentCardLabel("Q1 2025", 3)).toBe("Q1 2025 AR 3");
  });

  it("caps at AR5", () => {
    expect(nextAmendmentIndex([1, 2, 3, 4, 5])).toBeNull();
    expect(canCreateAmendment([1, 2, 3, 4, 5])).toBe(false);
    expect(nextAmendmentIndex([1, 2])).toBe(3);
  });

  it("encodes VAT period keys", () => {
    expect(vatPeriodKeyWithAmendment("18A1", 0)).toBe("18A1");
    expect(vatPeriodKeyWithAmendment("18A1", 2)).toBe("18A1::AR2");
    expect(parseVatPeriodKeyAmendment("18A1::AR2")).toEqual({
      basePeriodKey: "18A1",
      amendmentIndex: 2,
    });
  });
});

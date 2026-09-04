import { describe, expect, it } from "vitest";
import {
  ensureLtdSuffix,
  isValidPersonalCode,
  isValidPostcode,
  normalizeCompanyName,
  splitFullName,
  validateStructuredAddress,
  emptyAddress,
} from "./ch-wizard-shared";

describe("ch-wizard-shared", () => {
  it("splits person names", () => {
    expect(splitFullName("Jane Mary Smith")).toEqual({
      forename: "Jane Mary",
      surname: "Smith",
    });
  });

  it("normalizes company names for availability checks", () => {
    expect(normalizeCompanyName("  Example   Trading Ltd ")).toBe(
      "EXAMPLE TRADING LTD",
    );
  });

  it("adds Ltd suffix when missing", () => {
    expect(ensureLtdSuffix("Example Trading")).toBe("Example Trading Ltd");
    expect(ensureLtdSuffix("Example PLC")).toBe("Example PLC");
  });

  it("validates personal codes and postcodes", () => {
    expect(isValidPersonalCode("ABCD1234567")).toBe(true);
    expect(isValidPersonalCode("short")).toBe(false);
    expect(isValidPostcode("SW1A 1AA")).toBe(true);
    expect(isValidPostcode("invalid")).toBe(false);
  });

  it("validates structured addresses", () => {
    const ok = emptyAddress();
    ok.premise = "1";
    ok.street = "Test Street";
    ok.postTown = "London";
    ok.postcode = "SW1A 1AA";
    expect(validateStructuredAddress(ok)).toBeNull();
    expect(validateStructuredAddress(emptyAddress())).toMatch(/required/);
  });
});

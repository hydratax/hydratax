import { describe, expect, it } from "vitest";
import {
  CH_PRESENTER_CREDENTIAL_PATTERN,
  validatePresenterCredentials,
} from "./gateway-auth";

describe("validatePresenterCredentials", () => {
  it("rejects WebFiling-style email credentials", () => {
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "user@email.com";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "ABCDEFGH123";
    const result = validatePresenterCredentials();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/WebFiling email/i);
    }
  });

  it("accepts 11-character software presenter credentials", () => {
    process.env.COMPANIES_HOUSE_PRESENTER_ID = "00072271000";
    process.env.COMPANIES_HOUSE_PRESENTER_AUTH_CODE = "ABCDEFGH123";
    expect(validatePresenterCredentials().ok).toBe(true);
    expect(CH_PRESENTER_CREDENTIAL_PATTERN.test("00072271000")).toBe(true);
  });
});

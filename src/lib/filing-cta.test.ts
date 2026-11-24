import { describe, expect, it } from "vitest";
import {
  companyNumberFromResumePath,
  inferFilingCtaId,
  isFilingCtaId,
  serviceIdFromResumePath,
} from "./filing-cta";
import {
  isUkDaytimeForReminders,
  ukWeekdayAndHour,
} from "@/server/billing/signup-filing-intents";

describe("filing CTA helpers", () => {
  it("recognises CTA ids", () => {
    expect(isFilingCtaId("confirmation-statement")).toBe(true);
    expect(isFilingCtaId("nope")).toBe(false);
  });

  it("parses company and service from resume path", () => {
    const path =
      "/companies-house/accounts-ixbrl?company=14633422&resume=1";
    expect(companyNumberFromResumePath(path)).toBe("14633422");
    expect(serviceIdFromResumePath(path)).toBe("accounts-ixbrl");
    expect(inferFilingCtaId(path)).toBe("accounts-only");
  });

  it("infers CT600 & accounts from year-end both", () => {
    expect(
      inferFilingCtaId(
        "/companies-house/year-end?mode=both&company=14633422",
      ),
    ).toBe("file-ct600-accounts");
  });
});

describe("UK daytime reminder window", () => {
  it("returns weekday and hour for London", () => {
    const { weekday, hour } = ukWeekdayAndHour(
      new Date("2026-06-15T12:00:00Z"),
    );
    expect(weekday).toBeGreaterThanOrEqual(0);
    expect(weekday).toBeLessThanOrEqual(6);
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  });

  it("rejects late night UK times", () => {
    // 02:00 UTC in winter ≈ 02:00 London
    expect(isUkDaytimeForReminders(new Date("2026-01-15T02:00:00Z"))).toBe(
      false,
    );
    // 10:00 UTC winter ≈ 10:00 London
    expect(isUkDaytimeForReminders(new Date("2026-01-15T10:00:00Z"))).toBe(
      true,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  formatDueShort,
  parseFilingIsoDate,
  urgencyForDueDate,
} from "@/lib/filing-due";
import {
  applyOptimisticAccountsFiling,
  applyOptimisticCsFiling,
} from "@/server/companies-house/sync-client-snapshot";
import { addIsoCalendarYears } from "@/server/companies-house/enrich-client";
import type { ClientCompaniesHouseSnapshot } from "@/server/companies-house/enrich-client";

function snap(
  patch: Partial<ClientCompaniesHouseSnapshot>,
): ClientCompaniesHouseSnapshot {
  return {
    companyNumber: "12345678",
    companyName: "TEST LTD",
    companyStatus: "active",
    incorporatedOn: "2020-01-01",
    accountsNextDue: null,
    accountsPeriodEnd: null,
    confirmationStatementNextDue: null,
    confirmationStatementLastMadeUpTo: null,
    registeredOffice: null,
    sicCodes: [],
    directors: [],
    pscs: [],
    fetchedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("parseFilingIsoDate", () => {
  it("keeps the calendar day in local time", () => {
    const d = parseFilingIsoDate("2026-08-31");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7);
    expect(d!.getDate()).toBe(31);
  });
});

describe("urgencyForDueDate", () => {
  const now = new Date(2026, 8, 15, 12, 0, 0); // 15 Sep 2026

  it("marks past due as overdue", () => {
    expect(urgencyForDueDate("2026-08-31", now)).toBe("overdue");
  });

  it("marks within 30 days as due_soon", () => {
    expect(urgencyForDueDate("2026-09-20", now)).toBe("due_soon");
  });

  it("marks far future as ok", () => {
    expect(urgencyForDueDate("2027-05-12", now)).toBe("ok");
  });
});

describe("formatDueShort", () => {
  it("formats without UTC day shift", () => {
    expect(formatDueShort("2026-08-31")).toMatch(/31/);
    expect(formatDueShort("2026-08-31")).toMatch(/2026/);
  });
});

describe("addIsoCalendarYears", () => {
  it("advances anniversary dates", () => {
    expect(addIsoCalendarYears("2025-08-31", 1)).toBe("2026-08-31");
  });
});

describe("applyOptimisticCsFiling", () => {
  it("advances CS dates when register is stale", () => {
    const next = applyOptimisticCsFiling(
      snap({
        confirmationStatementLastMadeUpTo: "2024-07-22",
        confirmationStatementNextDue: "2025-08-05",
      }),
      "2025-07-22",
    );
    expect(next.confirmationStatementLastMadeUpTo).toBe("2025-07-22");
    expect(next.confirmationStatementNextMadeUpTo).toBe("2026-07-22");
    expect(next.confirmationStatementNextDue).toBe("2026-08-05");
  });

  it("leaves CH values when already updated", () => {
    const base = snap({
      confirmationStatementLastMadeUpTo: "2025-07-22",
      confirmationStatementNextDue: "2026-08-05",
    });
    const next = applyOptimisticCsFiling(base, "2025-07-22");
    expect(next.confirmationStatementNextDue).toBe("2026-08-05");
  });
});

describe("applyOptimisticAccountsFiling", () => {
  it("advances period end after filing", () => {
    const next = applyOptimisticAccountsFiling(
      snap({
        lastAccountsMadeUpTo: "2024-08-31",
        accountsPeriodEnd: "2025-08-31",
        accountsNextDue: "2026-05-31",
      }),
      "2025-08-31",
    );
    expect(next.lastAccountsMadeUpTo).toBe("2025-08-31");
    expect(next.accountsPeriodEnd).toBe("2026-08-31");
  });
});

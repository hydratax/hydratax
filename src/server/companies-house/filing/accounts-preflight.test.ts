import { describe, expect, it } from "vitest";
import type { ChCompanyProfile, ChOfficer } from "@/server/companies-house/api";
import {
  assertAccountsCompanyIdentity,
  assertAccountsPeriodNotAlreadyFiled,
  displayDirectorName,
  personNamesMatch,
  resolveAccountsSigningDirector,
} from "./accounts-preflight";

describe("personNamesMatch", () => {
  it("matches CH surnameNAME, Forenames with natural order", () => {
    expect(personNamesMatch("HAIDERY, Sher Ali Akbar", "Sher Ali Akbar Haidery")).toBe(
      true,
    );
    expect(personNamesMatch("ALI, Yumna", "Yumna Ali")).toBe(true);
  });

  it("rejects a director from a different person", () => {
    expect(
      personNamesMatch("HAIDERY, Sher Ali Akbar", "Yumna Ali"),
    ).toBe(false);
  });
});

describe("resolveAccountsSigningDirector", () => {
  const travelBudsOfficers: ChOfficer[] = [
    {
      name: "HAIDERY, Sher Ali Akbar",
      officer_role: "director",
      appointed_on: "2025-02-05",
    },
  ];
  const glamOfficers: ChOfficer[] = [
    {
      name: "ALI, Yumna",
      officer_role: "director",
      appointed_on: "2024-07-23",
    },
  ];

  it("accepts a claimed name that matches this company's active director", () => {
    const result = resolveAccountsSigningDirector({
      companyNumber: "16230089",
      claimedName: "Sher Ali Akbar Haidery",
      officers: travelBudsOfficers,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matchedOfficerName).toBe("HAIDERY, Sher Ali Akbar");
      expect(result.directorName).toBe("Sher Ali Akbar Haidery");
    }
  });

  it("rejects Glam director claimed against Travel Buds officers", () => {
    const result = resolveAccountsSigningDirector({
      companyNumber: "16230089",
      claimedName: "Yumna Ali",
      officers: travelBudsOfficers,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not an active director of company 16230089/i);
      expect(result.error).toMatch(/HAIDERY/i);
    }
  });

  it("uses the sole active director when no claim is supplied", () => {
    const result = resolveAccountsSigningDirector({
      companyNumber: "16230089",
      claimedName: null,
      officers: travelBudsOfficers,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe("sole_active_director");
      expect(result.directorName).toBe("Sher Ali Akbar Haidery");
    }
  });

  it("never invents a generic Director placeholder", () => {
    const result = resolveAccountsSigningDirector({
      companyNumber: "15855034",
      claimedName: "Director",
      officers: glamOfficers,
    });
    expect(result.ok).toBe(false);
  });

  it("requires an explicit choice when multiple active directors exist", () => {
    const result = resolveAccountsSigningDirector({
      companyNumber: "99999999",
      claimedName: null,
      officers: [
        { name: "ONE, Alpha", officer_role: "director" },
        { name: "TWO, Beta", officer_role: "director" },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/2 active directors/i);
    }
  });

  it("ignores resigned directors", () => {
    const result = resolveAccountsSigningDirector({
      companyNumber: "15855034",
      claimedName: "Raja Haris Aziz Minhas",
      officers: [
        ...glamOfficers,
        {
          name: "MINHAS, Raja Haris Aziz",
          officer_role: "director",
          resigned_on: "2025-09-01",
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe("assertAccountsCompanyIdentity", () => {
  const profile: ChCompanyProfile = {
    company_number: "16230089",
    company_name: "THE TRAVEL BUDS LIMITED",
    company_status: "active",
  };

  it("accepts matching name/number", () => {
    const result = assertAccountsCompanyIdentity({
      companyNumber: "16230089",
      companyName: "The Travel Buds Ltd",
      profile,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a different company name for the number", () => {
    const result = assertAccountsCompanyIdentity({
      companyNumber: "16230089",
      companyName: "GLAM BY YUMNA LTD",
      profile,
    });
    expect(result.ok).toBe(false);
  });
});

describe("assertAccountsPeriodNotAlreadyFiled", () => {
  it("blocks refiling an already-filed period end", () => {
    const profile: ChCompanyProfile = {
      company_number: "16230089",
      company_name: "THE TRAVEL BUDS LIMITED",
      accounts: {
        last_accounts: { made_up_to: "2026-02-28", period_end_on: "2026-02-28" },
        next_accounts: { period_end_on: "2027-02-28" },
      },
    };
    const result = assertAccountsPeriodNotAlreadyFiled({
      companyNumber: "16230089",
      periodEnd: "2026-02-28",
      profile,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/already on the Companies House register/i);
    }
  });
});

describe("displayDirectorName", () => {
  it("converts CH surname-first format", () => {
    expect(displayDirectorName("HAIDERY, Sher Ali Akbar")).toBe(
      "Sher Ali Akbar Haidery",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  evaluateNameAvailability,
  isExactRegisterMatch,
} from "./ch-name-availability";

describe("evaluateNameAvailability", () => {
  const items = [
    {
      company_number: "14633422",
      title: "HYDRA CONSULTANCY SERVICES LTD",
      company_status: "active",
    },
    {
      company_number: "12345678",
      title: "EXAMPLE TRADING LTD",
      company_status: "active",
    },
  ];

  it("flags exact match as taken", () => {
    const out = evaluateNameAvailability("Example Trading Ltd", items);
    expect(out.status).toBe("taken");
    expect(out.exactMatch?.company_number).toBe("12345678");
  });

  it("allows current company name when excluded", () => {
    const out = evaluateNameAvailability("Hydra Consultancy Services Ltd", items, {
      excludeCompanyNumber: "14633422",
    });
    expect(out.status).toBe("available");
  });

  it("treats fuzzy-only hits as available (Companies House checker behaviour)", () => {
    const out = evaluateNameAvailability("hyder it", [
      {
        company_number: "16702146",
        title: "HYDER MOTORS LTD",
        company_status: "active",
      },
      {
        company_number: "11111111",
        title: "HYDER IT SERVICES LTD",
        company_status: "active",
      },
    ]);
    expect(out.status).toBe("available");
    expect(out.message).toContain("No exact company name matches found");
    expect(out.similar.length).toBeGreaterThan(0);
  });

  it("matches proposed name without Ltd suffix against register title", () => {
    expect(isExactRegisterMatch("hyder it", "HYDER IT LTD")).toBe(true);
    expect(isExactRegisterMatch("hyder it", "HYDER MOTORS LTD")).toBe(false);
  });

  it("returns available when register has no matches", () => {
    const out = evaluateNameAvailability("Brand New Name Ltd", []);
    expect(out.status).toBe("available");
  });
});

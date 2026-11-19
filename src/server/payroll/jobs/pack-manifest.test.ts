import { describe, expect, it } from "vitest";
import { parsePackFromFileMap } from "./pack-manifest";
import { extractZipEntries } from "./zip-pack";
import { buildMigrationZipStoreOnly } from "@/server/payroll/migration-export";
import { EMPLOYEE_CSV_HEADERS, employeeCsvTemplateText } from "@/server/payroll/employee-csv";

describe("parsePackFromFileMap", () => {
  it("reads folder/employees.csv keyed by company number", () => {
    const csv = employeeCsvTemplateText();
    const res = parsePackFromFileMap({
      "12345678/employees.csv": csv,
      "87654321/employees.csv": csv,
    });
    expect(res.errors).toEqual([]);
    expect(res.items).toHaveLength(2);
    expect(res.items.map((i) => i.matchKey).sort()).toEqual([
      "12345678",
      "87654321",
    ]);
    expect(res.items[0]!.matchKind).toBe("company_number");
  });

  it("reads manifest.json with client_id", () => {
    const csv = employeeCsvTemplateText();
    const manifest = JSON.stringify({
      companies: [
        {
          client_id: "11111111-1111-4111-8111-111111111111",
          path: "a/employees.csv",
        },
      ],
    });
    const res = parsePackFromFileMap({
      "manifest.json": manifest,
      "a/employees.csv": csv,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.matchKind).toBe("client_id");
    expect(res.items[0]!.matchKey).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("zip round-trip with store-only builder", () => {
  it("extracts employees.csv from a pack zip", () => {
    const csv = employeeCsvTemplateText();
    const zip = buildMigrationZipStoreOnly([
      {
        filename: "12345678/employees.csv",
        csv,
        contentType: "text/csv; charset=utf-8",
      },
    ]);
    const entries = extractZipEntries(zip);
    expect(entries.some((e) => e.path === "12345678/employees.csv")).toBe(true);
    const text = entries
      .find((e) => e.path === "12345678/employees.csv")!
      .data.toString("utf8");
    expect(text.startsWith(EMPLOYEE_CSV_HEADERS.join(","))).toBe(true);
  });
});

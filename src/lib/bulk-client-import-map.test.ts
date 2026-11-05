import { describe, expect, it } from "vitest";
import {
  mapBulkImportRow,
  previewImportColumns,
} from "@/lib/bulk-client-import-map";

describe("mapBulkImportRow", () => {
  it("maps spaced and punctuated CH-style headers", () => {
    const mapped = mapBulkImportRow({
      "Company Name": "Acme Trading Ltd",
      "Company Number": "12345678",
      "Email Address": "accounts@acme.test",
      Telephone: "020 7946 0123",
      "Registered Office Address": "1 High Street, London",
      Postcode: "EC1A 1BB",
    });
    expect(mapped.name).toBe("Acme Trading Ltd");
    expect(mapped.companyNumber).toBe("12345678");
    expect(mapped.contactEmail).toBe("accounts@acme.test");
    expect(mapped.contactPhone).toBe("020 7946 0123");
  });

  it("prefers Company Name over a numeric name cell", () => {
    const mapped = mapBulkImportRow({
      name: "12345678",
      company_number: "12345678",
      "Company Name": "Acme Trading Ltd",
    });
    expect(mapped.name).toBe("Acme Trading Ltd");
    expect(mapped.companyNumber).toBe("12345678");
  });

  it("promotes a lone company-number-looking name into companyNumber", () => {
    const mapped = mapBulkImportRow({
      Name: "13949534",
    });
    expect(mapped.companyNumber).toBe("13949534");
    expect(mapped.name).toBeUndefined();
  });
});

describe("previewImportColumns", () => {
  it("reports recognised vs ignored headers", () => {
    const preview = previewImportColumns([
      "Company Name",
      "Company Number",
      "Phone",
      "Address Line 1",
      "SIC Code",
    ]);
    expect(preview.recognized.map((r) => r.field).sort()).toEqual(
      ["companyNumber", "contactPhone", "name"].sort(),
    );
    expect(preview.ignored).toEqual(
      expect.arrayContaining(["Address Line 1", "SIC Code"]),
    );
  });
});

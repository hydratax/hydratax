import { describe, expect, it } from "vitest";
import {
  bankStatementDesk,
  groupBankStatementsByDesk,
  isBankStatementDoc,
  toBankStatementSummary,
} from "./statement-docs";

describe("bank statement desk tags", () => {
  it("maps CT / VAT / SA categories", () => {
    expect(bankStatementDesk("accounts")).toBe("ct");
    expect(bankStatementDesk("corporation_tax")).toBe("ct");
    expect(bankStatementDesk("corporation_tax:bank_statement")).toBe("ct");
    expect(bankStatementDesk("vat")).toBe("vat");
    expect(bankStatementDesk("vat:bank_statement")).toBe("vat");
    expect(bankStatementDesk("vat:receipt")).toBeNull();
    expect(bankStatementDesk("sa:abc:bank_statement")).toBe("sa");
    expect(bankStatementDesk("self_assessment:bank_statement")).toBe("sa");
    expect(bankStatementDesk("payroll")).toBeNull();
  });

  it("recognises statement files across desks", () => {
    expect(
      isBankStatementDoc({
        filename: "q1.pdf",
        contentType: "application/pdf",
        category: "vat",
      }),
    ).toBe(true);
    expect(
      isBankStatementDoc({
        filename: "personal.csv",
        contentType: "text/csv",
        category: "sa:t1:bank_statement",
      }),
    ).toBe(true);
    expect(
      isBankStatementDoc({
        filename: "notes.txt",
        contentType: "text/plain",
        category: "vat",
      }),
    ).toBe(false);
  });

  it("groups summaries CT → VAT → SA", () => {
    const docs = [
      toBankStatementSummary({
        id: "1",
        filename: "sa.csv",
        blobUrl: "/a",
        contentType: "text/csv",
        sizeBytes: 10,
        createdAt: "2026-01-01",
        category: "sa:t1:bank_statement",
      })!,
      toBankStatementSummary({
        id: "2",
        filename: "ct.pdf",
        blobUrl: "/b",
        contentType: "application/pdf",
        sizeBytes: 10,
        createdAt: "2026-01-01",
        category: "accounts",
      })!,
      toBankStatementSummary({
        id: "3",
        filename: "vat.pdf",
        blobUrl: "/c",
        contentType: "application/pdf",
        sizeBytes: 10,
        createdAt: "2026-01-01",
        category: "vat",
      })!,
    ];
    expect(groupBankStatementsByDesk(docs).map((g) => g.desk)).toEqual([
      "ct",
      "vat",
      "sa",
    ]);
  });
});

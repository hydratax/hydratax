import { describe, expect, it } from "vitest";
import { parseUkStatementText } from "@/server/bank/parse-uk-statement-text";

describe("parseUkStatementText", () => {
  it("extracts Monzo-style dated lines and categorises fuel", () => {
    const text = `
Monzo Bank
Account statement
01/02/2026 ESSO PETROL LONDON 45.20
02/02/2026 SHELL VICTORIA -32.10
03/02/2026 ACME CLIENT LTD 1,250.00
04/02/2026 UNKNOWN SHOP XYZ 12.50
`;
    const { lines, meta } = parseUkStatementText(text);
    expect(meta.bankHint).toBe("Monzo");
    expect(lines.length).toBeGreaterThanOrEqual(3);

    const esso = lines.find((l) => /esso/i.test(l.description));
    expect(esso?.category).toBe("fuel");
    expect(esso?.amountPence).toBeLessThan(0);

    const shell = lines.find((l) => /shell/i.test(l.description));
    expect(shell?.amountPence).toBe(-3210);

    const unknown = lines.find((l) => /unknown shop/i.test(l.description));
    expect(unknown?.category).toBe("expense_queries");
    expect(unknown?.confidence).toBe("low");
  });

  it("parses day-month-year spaced dates", () => {
    const text = `
Starling Bank Limited
www.starlingbank.com
15 Jan 2026 Tesco Petrol 40.00
16 Jan 2026 Salary ACME PAYROLL 2000.00
`;
    const { lines, meta } = parseUkStatementText(text);
    expect(meta.bankHint).toBe("Starling");
    expect(lines.some((l) => l.dated === "2026-01-15")).toBe(true);
    const salary = lines.find((l) => /payroll|salary/i.test(l.description));
    expect(salary?.category).toBe("salaries");
  });

  it("skips balance and header noise", () => {
    const text = `
HSBC
Opening balance 100.00
01/03/2026 Card payment Pret A Manger 6.50
Closing balance 93.50
Page 1 of 2
`;
    const { lines } = parseUkStatementText(text);
    expect(lines).toHaveLength(1);
    expect(lines[0].description).toMatch(/pret/i);
  });
});

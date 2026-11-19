import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_CSV_HEADERS,
  employeeCsvTemplateText,
  parseEmployeeCsv,
} from "./employee-csv";

describe("employee CSV", () => {
  it("template includes all headers and a sample row", () => {
    const text = employeeCsvTemplateText();
    const [header] = text.trim().split("\n");
    expect(header).toBe(EMPLOYEE_CSV_HEADERS.join(","));
    expect(text.split("\n").filter(Boolean).length).toBe(2);
  });

  it("parses a valid row into employee fields", () => {
    const csv = `${EMPLOYEE_CSV_HEADERS.join(",")}\n` +
      [
        "Mei",
        "Chen",
        "QQ 12 34 56 A",
        "F",
        "12/05/1990",
        "1 King St",
        "York",
        "YO1 1AA",
        "1257L",
        "W1M1",
        "A",
        "28000",
        "",
        "37.5",
        "salary",
        "M1",
        "2025-04-06",
        "Analyst",
        "E001",
        "A",
        "true",
        "AN",
        "02",
        "yes",
        "false",
        "5",
        "11-22-33",
        "12345678",
        "M Chen",
        "2025-26",
        "1000",
        "200",
        "50",
      ].join(",") +
      "\n";

    const res = parseEmployeeCsv(csv);
    expect(res.errors).toEqual([]);
    expect(res.rows).toHaveLength(1);
    const row = res.rows[0]!;
    expect(row.forename).toBe("Mei");
    expect(row.nino).toBe("QQ123456A");
    expect(row.gender).toBe("F");
    expect(row.dateOfBirth).toBe("1990-05-12");
    expect(row.taxBasis).toBe("week1Month1");
    expect(row.isDirector).toBe(true);
    expect(row.postgraduateLoan).toBe(true);
    expect(row.studentLoanPlan).toBe("02");
    expect(row.bankSortCode).toBe("112233");
    expect(row.address).toContain("YO1 1AA");
    expect(row.bfTaxablePounds).toBe("1000");
  });

  it("rejects rows without salary or rate", () => {
    const csv =
      "forename,surname,nino,start_date,annual_salary\n" +
      "Sam,Taylor,QQ123456C,2024-04-06,\n";
    const res = parseEmployeeCsv(csv);
    expect(res.rows).toHaveLength(0);
    expect(res.errors.some((e) => e.message.includes("annual_salary"))).toBe(
      true,
    );
  });
});

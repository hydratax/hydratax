import { describe, expect, it } from "vitest";
import {
  parseBankCsv,
  resolveAmountPence,
  summariseForSelfAssessment,
} from "./categorise";

describe("resolveAmountPence", () => {
  it("prefers signed Amount when Money Out/In are empty", () => {
    expect(resolveAmountPence("-25.00", "", "", true, true)).toBe(-2500);
    expect(resolveAmountPence("500.00", "", "500.00", true, true)).toBe(50000);
  });

  it("uses Money Out when Amount is unsigned positive", () => {
    expect(resolveAmountPence("25.00", "25.00", "", true, true)).toBe(-2500);
  });

  it("keeps signed negative Money Out (Excel export style)", () => {
    expect(resolveAmountPence("0", "- 1,500.00", "", false, true)).toBe(-150000);
    expect(resolveAmountPence("0", "- 66.00", "", false, true)).toBe(-6600);
  });

  it("parses Money In without Amount column", () => {
    expect(resolveAmountPence("0", "", "300.00", false, true)).toBe(30000);
  });
});

describe("parseBankCsv", () => {
  it("parses Monzo export columns", () => {
    const csv = `Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In,Balance
tx_1,04/08/2026,12:00:00,Card payment,Test Shop,,Shopping,-25.00,GBP,-25.00,GBP,,,,Test purchase,,25.00,,1000.00
tx_2,05/08/2026,13:00:00,Faster payment,Client,,Income,500.00,GBP,500.00,GBP,,,,Payment received,,,500.00,1500.00`;

    const lines = parseBankCsv(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      dated: "2026-08-04",
      description: "Test purchase",
      amountPence: -2500,
    });
    expect(lines[1]).toMatchObject({
      dated: "2026-08-05",
      description: "Payment received",
      amountPence: 50000,
    });
  });

  it("parses simple date,description,amount CSV", () => {
    const csv = `Date,Description,Amount
01/01/2026,Office rent,-1200.00
02/01/2026,Client payment,2500.00`;

    const lines = parseBankCsv(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0].amountPence).toBe(-120000);
    expect(lines[1].amountPence).toBe(250000);
  });

  it("parses Monzo when Money Out/In columns are blank but Amount is signed", () => {
    const csv = `Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In,Balance
tx_1,04/08/2026,12:00:00,Card payment,Test Shop,,Shopping,-25.00,GBP,-25.00,GBP,,,,Fuel purchase,,,,1000.00
tx_2,05/08/2026,13:00:00,Faster payment,Client,,Income,500.00,GBP,500.00,GBP,,,,Payment received,,,,1500.00`;

    const lines = parseBankCsv(csv);
    expect(lines).toHaveLength(2);
    expect(lines[0].amountPence).toBe(-2500);
    expect(lines[1].amountPence).toBe(50000);
  });

  it("parses Excel Monzo export with signed Money Out column", () => {
    const csv = `Date,Type,Name,Emoji,Category,Notes and #,Description,Category split,Money Out,Money In,Balance
30/07/2026,Faster payment,Arshad Mahmood,,General,Arshad Mahmood,Arshad Mahmood,,- 1500.00,,1000.00
30/07/2026,Faster payment,COMFORT LOUNGE LTD,,Income,plum 3 2,plum 3 2,,,300.00,1300.00
31/07/2026,Direct Debit,Transport,,Travel,250110179002238138,250110179002238138,,- 66.00,,1234.00`;

    const lines = parseBankCsv(csv);
    expect(lines).toHaveLength(3);
    expect(lines[0].amountPence).toBe(-150000);
    expect(lines[1].amountPence).toBe(30000);
    expect(lines[2].amountPence).toBe(-6600);
  });
});

describe("summariseForSelfAssessment", () => {
  it("limits limited company bank SA to director pay and dividends", () => {
    const summary = summariseForSelfAssessment(
      [
        {
          dated: "2026-01-01",
          description: "Sale",
          amountPence: 100000,
          category: "turnover",
          confidence: "low",
        },
        {
          dated: "2026-01-02",
          description: "Director salary",
          amountPence: -50000,
          category: "directors_remuneration",
          confidence: "high",
        },
        {
          dated: "2026-01-03",
          description: "Dividend",
          amountPence: -20000,
          category: "dividends",
          confidence: "high",
        },
      ],
      { clientType: "limited_company" },
    );

    expect(summary.fromCompanyBank).toBe(true);
    expect(summary.directorRemunerationPence).toBe(50000);
    expect(summary.dividendPence).toBe(20000);
    expect(summary.turnoverPence).toBe(50000);
    expect(summary.otherIncomePence).toBe(20000);
  });
});

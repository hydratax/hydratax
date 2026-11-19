import { describe, expect, it } from "vitest";
import {
  bacsJulianDate,
  bacsOriginatorReady,
  buildAuddisNewInstructionsFile,
  buildBacsStandard18File,
  isUkDomesticBankAccount,
  nextBankingDay,
} from "./bacs-standard18";

const originator = {
  serviceUserNumber: "123456",
  sortCode: "20-00-00",
  accountNumber: "12345678",
  accountName: "ACME PAYROLL LTD",
};

describe("Bacs Standard 18", () => {
  it("requires SUN and originator account", () => {
    expect(bacsOriginatorReady({})).toBe(false);
    expect(bacsOriginatorReady(originator)).toBe(true);
    expect(isUkDomesticBankAccount("200000", "12345678")).toBe(true);
    expect(isUkDomesticBankAccount("20-00", "123")).toBe(false);
  });

  it("formats Bacs julian dates and skips weekends", () => {
    expect(bacsJulianDate("2026-01-01")).toBe(" 26001");
    expect(nextBankingDay("2026-11-21")).toBe("2026-11-23"); // Sat → Mon
  });

  it("builds a credit file with VOL/HDR/UHL/CONTRA/UTL", () => {
    const file = buildBacsStandard18File({
      originator,
      processingDateIso: "2026-11-20",
      payments: [
        {
          sortCode: "309070",
          accountNumber: "12345678",
          accountName: "A WORKER",
          amountPence: 150_050,
          reference: "NOV PAY",
        },
      ],
    });
    expect(file).toBeTruthy();
    const lines = file!.split("\r\n").filter(Boolean);
    expect(lines[0]!.startsWith("VOL1")).toBe(true);
    expect(lines[0]!.length).toBe(80);
    expect(lines[1]!.startsWith("HDR1")).toBe(true);
    expect(lines[2]!.startsWith("HDR2")).toBe(true);
    expect(lines[3]!.startsWith("UHL1")).toBe(true);
    expect(lines[4]!.length).toBe(100);
    expect(lines[4]!.slice(15, 17)).toBe("99");
    expect(lines[4]!).toContain("00000150050");
    expect(lines[5]!.slice(15, 17)).toBe("17");
    expect(lines[5]!).toContain("CONTRA");
    expect(lines.at(-1)!.startsWith("UTL1")).toBe(true);
  });

  it("returns null when no payable bank rows", () => {
    expect(
      buildBacsStandard18File({
        originator,
        processingDateIso: "2026-11-20",
        payments: [
          {
            sortCode: "12",
            accountNumber: "1",
            accountName: "X",
            amountPence: 100,
            reference: "X",
          },
        ],
      }),
    ).toBeNull();
  });

  it("builds AUDDIS 0N instructions without CONTRA", () => {
    const file = buildAuddisNewInstructionsFile({
      originator,
      processingDateIso: "2026-11-20",
      mandates: [
        {
          sortCode: "309070",
          accountNumber: "87654321",
          accountName: "A WORKER",
          reference: "DD REF 001",
        },
      ],
    });
    expect(file).toBeTruthy();
    expect(file!).toContain("0N");
    expect(file!).not.toContain("CONTRA");
  });
});

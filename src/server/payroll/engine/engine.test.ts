import { describe, expect, it } from "vitest";
import { calculatePayeTax, parseTaxCode } from "./tax";
import {
  allocateBandsYtd,
  calculateClass1Ni,
  ytdThresholdCaps,
} from "./ni";
import { calculateStudentLoans, roundDownToPound } from "./student-loans";
import { ratesForTaxYear } from "./rates";

describe("parseTaxCode", () => {
  it("parses Scottish cumulative and Welsh W1", () => {
    const s = parseTaxCode("S1257L");
    expect(s.regime).toBe("S");
    expect(s.fpsCode).toBe("1257L");
    expect(s.annualAllowancePence).toBe(12_570_00);
    expect(s.basis).toBe("cumulative");

    const c = parseTaxCode("C1257L M1");
    expect(c.regime).toBe("C");
    expect(c.basis).toBe("week1Month1");
    expect(c.fpsCode).toBe("1257L");
  });

  it("parses BR, 0T, NT, K", () => {
    expect(parseTaxCode("BR").special).toBe("BR");
    expect(parseTaxCode("0T").special).toBe("0T");
    expect(parseTaxCode("NT").special).toBe("NT");
    expect(parseTaxCode("K500").annualAllowancePence).toBe(-5_000_00);
  });
});

describe("PAYE tax (pence)", () => {
  it("Month 1 W1/M1 basic rate after period PA", () => {
    // Monthly PA share of £12,570 = floor(1257000/12) = 104750
    // Taxable 300000 − 104750 = 195250 @ 20% = 39050
    const r = calculatePayeTax({
      taxCode: "1257L",
      taxBasis: "week1Month1",
      frequency: "M1",
      taxablePayPence: 300_000,
      ytdTaxablePence: 0,
      ytdTaxPence: 0,
      periodsElapsed: 1,
      taxYear: "2026-27",
    });
    expect(r.taxPence).toBe(39_050);
    expect(Number.isInteger(r.taxPence)).toBe(true);
  });

  it("BR taxes all at basic rate", () => {
    const r = calculatePayeTax({
      taxCode: "BR",
      taxBasis: "week1Month1",
      frequency: "M1",
      taxablePayPence: 200_000,
      ytdTaxablePence: 0,
      ytdTaxPence: 0,
      periodsElapsed: 1,
      taxYear: "2026-27",
    });
    expect(r.taxPence).toBe(40_000);
  });

  it("NT deducts nothing", () => {
    const r = calculatePayeTax({
      taxCode: "NT",
      frequency: "M1",
      taxablePayPence: 500_000,
      ytdTaxablePence: 0,
      ytdTaxPence: 0,
      periodsElapsed: 1,
    });
    expect(r.taxPence).toBe(0);
  });
});

describe("Class 1 NI (pence)", () => {
  it("category A monthly employee + employer", () => {
    const rates = ratesForTaxYear("2026-27");
    // Gross £3,000; PT £1,048; ST £417
    // Employee: (300000-104800)*8% = 15616
    // Employer: (300000-41700)*15% = 38745
    const r = calculateClass1Ni({
      category: "A",
      frequency: "M1",
      grossPence: 300_000,
      ytdGrossPence: 0,
      ytdEmployeeNiPence: 0,
      ytdEmployerNiPence: 0,
      periodsElapsed: 1,
      taxYear: "2026-27",
    });
    expect(r.employeeNiPence).toBe(
      Math.round((300_000 - rates.ptMonthlyPence) * 0.08),
    );
    expect(r.employerNiPence).toBe(
      Math.round((300_000 - rates.stMonthlyPence) * 0.15),
    );
    expect(Number.isInteger(r.employeeNiPence)).toBe(true);
  });

  it("category C employee NI is nil; employer still due", () => {
    const r = calculateClass1Ni({
      category: "C",
      frequency: "M1",
      grossPence: 300_000,
      ytdGrossPence: 0,
      ytdEmployeeNiPence: 0,
      ytdEmployerNiPence: 0,
      periodsElapsed: 1,
    });
    expect(r.employeeNiPence).toBe(0);
    expect(r.employerNiPence).toBeGreaterThan(0);
  });

  it("directors annual method accumulates on YTD", () => {
    const first = calculateClass1Ni({
      category: "A",
      frequency: "M1",
      grossPence: 300_000,
      ytdGrossPence: 0,
      ytdEmployeeNiPence: 0,
      ytdEmployerNiPence: 0,
      directorsAnnualMethod: true,
      taxYear: "2026-27",
    });
    const second = calculateClass1Ni({
      category: "A",
      frequency: "M1",
      grossPence: 300_000,
      ytdGrossPence: 300_000,
      ytdEmployeeNiPence: first.ytdEmployeeNiPence,
      ytdEmployerNiPence: first.ytdEmployerNiPence,
      directorsAnnualMethod: true,
      taxYear: "2026-27",
    });
    expect(first.employeeNiPence).toBe(0); // under annual PT £12,570
    expect(second.ytdEmployeeNiPence).toBe(
      first.ytdEmployeeNiPence + second.employeeNiPence,
    );
    expect(Number.isInteger(second.employerNiPence)).toBe(true);
  });

  it("alternative directors method uses period thresholds (like AL)", () => {
    // £3,000 / month: above monthly PT £1,048 → employee NI under period method
    const al = calculateClass1Ni({
      category: "A",
      frequency: "M1",
      grossPence: 300_000,
      ytdGrossPence: 0,
      ytdEmployeeNiPence: 0,
      ytdEmployerNiPence: 0,
      directorsAnnualMethod: false,
      taxYear: "2026-27",
    });
    const an = calculateClass1Ni({
      category: "A",
      frequency: "M1",
      grossPence: 300_000,
      ytdGrossPence: 0,
      ytdEmployeeNiPence: 0,
      ytdEmployerNiPence: 0,
      directorsAnnualMethod: true,
      taxYear: "2026-27",
    });
    expect(al.employeeNiPence).toBeGreaterThan(0);
    expect(an.employeeNiPence).toBe(0);
  });

  it("YTD bands hit exact GOV.UK monthly edges (whole pounds)", () => {
    const rates = ratesForTaxYear("2026-27");
    // Month 1: earnings exactly at monthly UEL £4,189
    const atUel = calculateClass1Ni({
      category: "A",
      frequency: "M1",
      grossPence: rates.uelMonthlyPence,
      ytdGrossPence: 0,
      ytdEmployeeNiPence: 0,
      ytdEmployerNiPence: 0,
      periodsElapsed: 1,
      taxYear: "2026-27",
    });
    expect(atUel.bandsYtd.atLelYtdPence).toBe(rates.lelMonthlyPence);
    expect(atUel.bandsYtd.lelToPtYtdPence).toBe(
      rates.ptMonthlyPence - rates.lelMonthlyPence,
    );
    expect(atUel.bandsYtd.ptToUelYtdPence).toBe(
      rates.uelMonthlyPence - rates.ptMonthlyPence,
    );
    // Sum of three bands = UEL (nothing above UEL in FPS band fields)
    expect(
      atUel.bandsYtd.atLelYtdPence +
        atUel.bandsYtd.lelToPtYtdPence +
        atUel.bandsYtd.ptToUelYtdPence,
    ).toBe(rates.uelMonthlyPence);

    // Month 5 cumulative: 5 × monthly thresholds
    const caps = ytdThresholdCaps(rates, "M1", 5, false);
    expect(caps.lel).toBe(rates.lelMonthlyPence * 5);
    expect(caps.pt).toBe(rates.ptMonthlyPence * 5);
    expect(caps.uel).toBe(rates.uelMonthlyPence * 5);
    const mid = allocateBandsYtd(
      rates.ptMonthlyPence * 5 + 50_00,
      caps.lel,
      caps.pt,
      caps.uel,
    );
    expect(mid.atLelYtdPence + mid.lelToPtYtdPence).toBe(caps.pt);
    expect(mid.ptToUelYtdPence).toBe(50_00);
    // Pence remainder floors out of bands
    expect(
      allocateBandsYtd(rates.lelMonthlyPence + 99, caps.lel, caps.pt, caps.uel)
        .atLelYtdPence,
    ).toBe(rates.lelMonthlyPence);
  });

  it("directors AN bands use annual LEL/PT/UEL edges", () => {
    const rates = ratesForTaxYear("2026-27");
    const r = calculateClass1Ni({
      category: "A",
      frequency: "M1",
      grossPence: 5_000_00,
      ytdGrossPence: 10_000_00,
      ytdEmployeeNiPence: 0,
      ytdEmployerNiPence: 0,
      periodsElapsed: 3,
      directorsAnnualMethod: true,
      taxYear: "2026-27",
    });
    expect(r.bandsYtd.atLelYtdPence).toBe(rates.lelAnnualPence);
    expect(
      r.bandsYtd.atLelYtdPence +
        r.bandsYtd.lelToPtYtdPence +
        r.bandsYtd.ptToUelYtdPence,
    ).toBe(15_000_00);
  });
});

describe("student loans (pence)", () => {
  it("rounds down to whole pounds", () => {
    expect(roundDownToPound(1999)).toBe(1900);
    expect(roundDownToPound(2000)).toBe(2000);
  });

  it("Plan 2 monthly 2026–27 above threshold", () => {
    // Threshold floor(2938500/12)=244875; earnings 300000; excess 55125 * 9% = 4961.25 → £49.00
    const r = calculateStudentLoans({
      frequency: "M1",
      niableEarningsPence: 300_000,
      studentLoanPlan: "02",
      taxYear: "2026-27",
    });
    expect(r.planType).toBe("02");
    expect(r.studentLoanPence).toBe(4_900);
    expect(r.studentLoanPence % 100).toBe(0);
  });

  it("PGL at 6%", () => {
    const r = calculateStudentLoans({
      frequency: "M1",
      niableEarningsPence: 300_000,
      postgraduateLoan: true,
      taxYear: "2026-27",
    });
    // threshold 175000; excess 125000 * 6% = 7500 → £75.00
    expect(r.postgraduateLoanPence).toBe(7_500);
  });
});

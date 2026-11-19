import { describe, expect, it } from "vitest";
import {
  AE_THRESHOLDS_2026_27,
  assessAeWorker,
  classifyAeWorkerCategory,
  summariseAeDesk,
} from "./ae-assessment";

describe("AE assessment (GOV.UK 2026–27)", () => {
  it("uses published trigger and band edges", () => {
    expect(AE_THRESHOLDS_2026_27.triggerAnnualPence).toBe(10_000_00);
    expect(AE_THRESHOLDS_2026_27.triggerMonthlyPence).toBe(833_00);
    expect(AE_THRESHOLDS_2026_27.lowerMonthlyPence).toBe(520_00);
  });

  it("classifies eligible jobholder (22–SPA, at trigger)", () => {
    expect(
      classifyAeWorkerCategory({
        ageYears: 30,
        earningsPence: 833_00,
        triggerPence: 833_00,
        lowerPence: 520_00,
      }),
    ).toBe("eligible_jobholder");
  });

  it("classifies non-eligible when under trigger but above lower", () => {
    expect(
      classifyAeWorkerCategory({
        ageYears: 30,
        earningsPence: 600_00,
        triggerPence: 833_00,
        lowerPence: 520_00,
      }),
    ).toBe("non_eligible_jobholder");
  });

  it("classifies entitled worker below lower band", () => {
    expect(
      classifyAeWorkerCategory({
        ageYears: 30,
        earningsPence: 400_00,
        triggerPence: 833_00,
        lowerPence: 520_00,
      }),
    ).toBe("entitled_worker");
  });

  it("assessAeWorker: enrolled when eligible + contributing", () => {
    const r = assessAeWorker({
      dateOfBirth: "1990-06-15",
      assessmentDate: "2026-08-14",
      annualSalaryPence: 30_000_00,
      frequency: "M1",
      pensionOptOut: false,
      hasContributions: true,
    });
    expect(r.status).toBe("enrolled");
    expect(r.label).toBe("Enrolled");
  });

  it("assessAeWorker: opted out overlays category", () => {
    const r = assessAeWorker({
      dateOfBirth: "1990-06-15",
      assessmentDate: "2026-08-14",
      annualSalaryPence: 30_000_00,
      frequency: "M1",
      pensionOptOut: true,
      hasContributions: false,
    });
    expect(r.status).toBe("opted_out");
  });

  it("assessAeWorker: needs review without date of birth", () => {
    const r = assessAeWorker({
      assessmentDate: "2026-08-14",
      annualSalaryPence: 30_000_00,
      frequency: "M1",
    });
    expect(r.status).toBe("review");
  });

  it("summarises desk counts", () => {
    const s = summariseAeDesk([
      {
        employeeId: "1",
        forename: "A",
        surname: "B",
        status: "enrolled",
        label: "Enrolled",
        active: true,
      },
      {
        employeeId: "2",
        forename: "C",
        surname: "D",
        status: "opted_out",
        label: "Opted out",
        active: true,
      },
      {
        employeeId: "3",
        forename: "E",
        surname: "F",
        status: "eligible",
        label: "Eligible to enrol",
        active: false,
      },
    ]);
    expect(s.enrolled).toBe(1);
    expect(s.optedOut).toBe(1);
    expect(s.eligible).toBe(0);
  });
});

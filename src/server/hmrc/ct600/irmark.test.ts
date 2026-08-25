import { describe, expect, it } from "vitest";
import { computeIrmark, injectIrmark } from "@/server/hmrc/ct600/irmark";

describe("computeIrmark", () => {
  it("is deterministic for the same body payload", () => {
    const body = `<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5">
      <IRheader>
        <DefaultCurrency>GBP</DefaultCurrency>
      </IRheader>
    </IRenvelope>`;
    const a = computeIrmark(body);
    const b = computeIrmark(body);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
  });

  it("ignores an existing IRmark when hashing", () => {
    const base = `<IRenvelope><IRheader><DefaultCurrency>GBP</DefaultCurrency></IRheader></IRenvelope>`;
    const withMark = injectIrmark(base, "abc123");
    expect(computeIrmark(withMark)).toBe(computeIrmark(base));
  });

  it("injects IRmark after DefaultCurrency", () => {
    const body = `<IRenvelope><IRheader><DefaultCurrency>GBP</DefaultCurrency></IRheader></IRenvelope>`;
    const mark = computeIrmark(body);
    const out = injectIrmark(body, mark);
    expect(out).toContain(`<IRmark Type="generic">${mark}</IRmark>`);
  });

  it("injects IRmark before closing IRheader when DefaultCurrency is absent", () => {
    const body = `<IRenvelope><IRheader><Keys/></IRheader><EmployerPaymentSummary/></IRenvelope>`;
    const mark = computeIrmark(body);
    const out = injectIrmark(body, mark);
    expect(out).toContain(`<IRmark Type="generic">${mark}</IRmark></IRheader>`);
  });
});

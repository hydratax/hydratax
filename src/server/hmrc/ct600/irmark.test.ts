import { describe, expect, it } from "vitest";
import { CT_NS } from "@/server/hmrc/ct600/ct-xml";
import { computeIrmark, injectIrmark } from "@/server/hmrc/ct600/irmark";

const sampleBody = `<ct:IRenvelope xmlns:ct="${CT_NS}">
      <ct:IRheader>
        <ct:DefaultCurrency>GBP</ct:DefaultCurrency>
      </ct:IRheader>
    </ct:IRenvelope>`;

describe("computeIrmark", () => {
  it("is deterministic for the same body payload", () => {
    const a = computeIrmark(sampleBody);
    const b = computeIrmark(sampleBody);
    expect(a).toBe(b);
  });

  it("produces a 28-character base64 SHA-1 digest", () => {
    const mark = computeIrmark(sampleBody);
    expect(mark).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(mark.length).toBe(28);
  });

  it("ignores an existing IRmark when hashing", () => {
    const base = `<ct:IRenvelope><ct:IRheader><ct:DefaultCurrency>GBP</ct:DefaultCurrency></ct:IRheader></ct:IRenvelope>`;
    const withMark = injectIrmark(base, "abc123");
    expect(computeIrmark(withMark)).toBe(computeIrmark(base));
  });

  it("injects IRmark before Sender when present", () => {
    const body = `<ct:IRenvelope><ct:IRheader><ct:DefaultCurrency>GBP</ct:DefaultCurrency><ct:Sender>Company</ct:Sender></ct:IRheader></ct:IRenvelope>`;
    const mark = computeIrmark(body);
    const out = injectIrmark(body, mark);
    expect(out).toContain(`<ct:IRmark Type="generic">${mark}</ct:IRmark><ct:Sender>Company</ct:Sender>`);
  });

  it("injects IRmark after DefaultCurrency when Sender is absent", () => {
    const body = `<ct:IRenvelope><ct:IRheader><ct:DefaultCurrency>GBP</ct:DefaultCurrency></ct:IRheader></ct:IRenvelope>`;
    const mark = computeIrmark(body);
    const out = injectIrmark(body, mark);
    expect(out).toContain(`<ct:IRmark Type="generic">${mark}</ct:IRmark>`);
  });
});

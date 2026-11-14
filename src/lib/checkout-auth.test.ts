import { describe, expect, it } from "vitest";
import {
  accountFirstCheckoutUrl,
  isCompaniesHouseOneOffCheckout,
  resolveDeskCheckoutAuth,
} from "./checkout-auth";

describe("resolveDeskCheckoutAuth", () => {
  const real = {
    local: false,
    practiceId: "prac_1",
    userId: "user_1",
    email: "a@example.com",
  };

  it("refuses anonymous desk plans with needsAuth", () => {
    const r = resolveDeskCheckoutAuth({
      session: null,
      planKey: "practice:Practice",
    });
    expect(r).toEqual({
      ok: false,
      needsAuth: true,
      planKey: "practice:Practice",
    });
  });

  it("refuses local/demo sessions for desk plans", () => {
    const r = resolveDeskCheckoutAuth({
      session: { ...real, local: true, practiceId: "local" },
      planKey: "practice:Custom:vat:11",
    });
    expect(r.ok).toBe(false);
    if (!r.ok && "needsAuth" in r) {
      expect(r.needsAuth).toBe(true);
    }
  });

  it("refuses empty practiceId even when session claims non-local", () => {
    const r = resolveDeskCheckoutAuth({
      session: { ...real, practiceId: "  " },
      planKey: "vat:One company or sole trader",
    });
    expect(r).toEqual({
      ok: false,
      needsAuth: true,
      planKey: "vat:One company or sole trader",
    });
  });

  it("allows signed-in desk checkout with practiceId", () => {
    const r = resolveDeskCheckoutAuth({
      session: real,
      planKey: "practice:Practice",
    });
    expect(r).toEqual({
      ok: true,
      practiceId: "prac_1",
      userId: "user_1",
      email: "a@example.com",
    });
  });

  it("allows CH one-off with chRequestId and owner practice without session", () => {
    const r = resolveDeskCheckoutAuth({
      session: null,
      planKey: "companies-house:confirmation-statement",
      chRequestId: "11111111-1111-1111-1111-111111111111",
      chOwnerPracticeId: "prac_ch",
    });
    expect(r).toEqual({
      ok: true,
      practiceId: "prac_ch",
      userId: "",
      email: null,
    });
  });

  it("refuses CH planKey without chRequestId", () => {
    expect(
      isCompaniesHouseOneOffCheckout("companies-house:cs01", undefined),
    ).toBe(false);
    const r = resolveDeskCheckoutAuth({
      session: null,
      planKey: "companies-house:cs01",
    });
    expect(r).toMatchObject({ ok: false, needsAuth: true });
  });
});

describe("accountFirstCheckoutUrl", () => {
  it("does not double-encode the plan in next", () => {
    const url = accountFirstCheckoutUrl("practice:Practice");
    const qs = new URL(url, "https://hydratax.uk").searchParams;
    expect(qs.get("plan")).toBe("practice:Practice");
    expect(qs.get("next")).toBe("/pricing?plan=practice:Practice");
  });
});

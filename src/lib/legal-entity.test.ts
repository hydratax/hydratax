import { describe, expect, it } from "vitest";
import {
  LEGAL_ENTITY,
  isTodoValue,
  pendingLegalEntityTodos,
  todo,
} from "@/lib/legal-entity";
import { SUBPROCESSORS } from "@/lib/subprocessors";
import {
  STORAGE_INVENTORY,
  consentBannerRequired,
  type StorageItem,
} from "@/lib/cookie-inventory";

describe("legal entity placeholders", () => {
  it("keeps owner-only facts as visible TODOs (never invented)", () => {
    const pending = pendingLegalEntityTodos();
    for (const key of ["registeredOffice", "icoRegistrationNumber", "hostingRegion"]) {
      expect(pending).toContain(key);
    }
    expect(isTodoValue(todo("x"))).toBe(true);
    expect(isTodoValue("real value")).toBe(false);
  });

  it("promises customers notice faster than their own 72h ICO clock", () => {
    expect(LEGAL_ENTITY.processorBreachNoticeHours).toBeLessThanOrEqual(48);
    expect(LEGAL_ENTITY.processorBreachNoticeHours).toBeGreaterThan(0);
  });

  it("links to the ICO complaint page", () => {
    expect(LEGAL_ENTITY.icoComplaintUrl).toBe("https://ico.org.uk/make-a-complaint/");
  });
});

describe("sub-processor register", () => {
  it("covers the vendors the code integrates with", () => {
    const names = SUBPROCESSORS.map((s) => s.name).join(" | ");
    for (const v of ["Supabase", "Netlify", "Cloudflare", "Stripe", "Resend", "Twilio", "Meta"]) {
      expect(names).toContain(v);
    }
  });
  it("every entry states role, data, location and transfer mechanism", () => {
    for (const s of SUBPROCESSORS) {
      expect(s.role).toBeTruthy();
      expect(s.data).toBeTruthy();
      expect(s.location).toBeTruthy();
      expect(s.transfer).toBeTruthy();
    }
  });
});

describe("cookie / PECR inventory", () => {
  it("currently needs no consent banner (only strictly necessary storage)", () => {
    expect(STORAGE_INVENTORY.length).toBeGreaterThan(0);
    expect(STORAGE_INVENTORY.every((i) => i.strictlyNecessary)).toBe(true);
    expect(consentBannerRequired()).toBe(false);
  });

  it("flags a banner as required as soon as non-essential storage is added", () => {
    const analytics: StorageItem = {
      name: "_ga",
      kind: "cookie",
      setBy: "us",
      purpose: "analytics",
      duration: "2 years",
      strictlyNecessary: false,
      exemption: "none",
    };
    expect(consentBannerRequired([...STORAGE_INVENTORY, analytics])).toBe(true);
  });

  it("every necessary item records why it is exempt", () => {
    for (const i of STORAGE_INVENTORY) expect(i.exemption.length).toBeGreaterThan(5);
  });
});

import { describe, expect, it } from "vitest";
import {
  DELETION_GRACE_DAYS,
  newCancelToken,
  scheduledFor,
  sha256,
  subjectRef,
  summariseSteps,
  verifyCancelToken,
} from "@/server/privacy/user-erasure";
import { escapeLike } from "@/server/privacy/user-export";
import {
  blindIndex,
  decryptField,
  encryptField,
  isEncryptedField,
} from "@/server/privacy/field-crypto";

describe("cancel tokens", () => {
  it("round-trips and only stores a hash", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    const { token, hash } = newCancelToken(id);
    expect(token.startsWith(`${id}.`)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(token).not.toContain(hash);
    expect(verifyCancelToken(token, hash)).toBe(true);
  });

  it("rejects wrong, tampered, empty or missing tokens", () => {
    const { token, hash } = newCancelToken("id");
    expect(verifyCancelToken(`${token}x`, hash)).toBe(false);
    expect(verifyCancelToken("id.", hash)).toBe(false);
    expect(verifyCancelToken("", hash)).toBe(false);
    expect(verifyCancelToken(token, null)).toBe(false);
    expect(verifyCancelToken(token, sha256("other"))).toBe(false);
  });

  it("generates unguessable, distinct tokens", () => {
    const a = newCancelToken("x").token;
    const b = newCancelToken("x").token;
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).toHaveLength(48);
  });
});

describe("erasure helpers", () => {
  it("pseudonymises subject by lower-cased email hash", () => {
    expect(subjectRef(" A@B.com ")).toBe(subjectRef("a@b.com"));
    expect(subjectRef("a@b.com")).not.toContain("a@b.com");
  });

  it("schedules after the configured grace period", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const due = scheduledFor(now);
    expect(due.getTime() - now.getTime()).toBe(DELETION_GRACE_DAYS * 86_400_000);
    expect(DELETION_GRACE_DAYS).toBeGreaterThanOrEqual(1);
  });

  it("summarises steps without personal data", () => {
    const s = summariseSteps([
      { step: "a", ok: true },
      { step: "b", ok: false, error: "boom" },
      { step: "c", ok: true, skipped: true },
    ]);
    expect(s).toEqual({ total: 3, failed: [{ step: "b", error: "boom" }], skipped: 1 });
  });

  it("escapes LIKE wildcards in e-mail lookups", () => {
    expect(escapeLike("a_b%c\\d@x.com")).toBe("a\\_b\\%c\\\\d@x.com");
  });
});

describe("field-crypto (unwired helper)", () => {
  it("round-trips and is idempotent", () => {
    const enc = encryptField("QQ123456C");
    expect(enc).not.toBeNull();
    expect(isEncryptedField(enc)).toBe(true);
    expect(enc).not.toContain("QQ123456C");
    expect(decryptField(enc)).toBe("QQ123456C");
    expect(encryptField(enc)).toBe(enc);
  });

  it("passes legacy plaintext through unchanged (backward compatible)", () => {
    expect(decryptField("QQ123456C")).toBe("QQ123456C");
    expect(decryptField(null)).toBeNull();
    expect(decryptField("")).toBeNull();
  });

  it("blind index is deterministic, normalised and keyed", () => {
    const a = blindIndex("qq 12 34 56 c", "k1");
    expect(a).toBe(blindIndex("QQ123456C", "k1"));
    expect(a).not.toBe(blindIndex("QQ123456C", "k2"));
    expect(() => blindIndex("x", "")).toThrow();
  });
});

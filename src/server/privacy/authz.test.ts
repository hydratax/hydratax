import { describe, expect, it } from "vitest";
import {
  ERASE_ACCOUNT_PHRASE,
  ERASE_CLIENT_PHRASE,
  PrivacyAuthError,
  assertAccountEmailConfirmation,
  assertClientErasureConfirmation,
  assertPhrase,
  assertPracticeAdmin,
  assertSelfSubject,
  classifyPracticeForUserErasure,
  deletionDueAt,
  isPracticeAdmin,
  normalisePhrase,
} from "@/server/privacy/authz";

describe("assertPracticeAdmin", () => {
  it("allows owner and admin with full access", () => {
    expect(() => assertPracticeAdmin({ role: "owner", moduleAccess: "full" })).not.toThrow();
    expect(() => assertPracticeAdmin({ role: "admin" })).not.toThrow();
  });
  it.each(["practitioner", "readonly", "", "OWNER", "superuser"])(
    "rejects role %p",
    (role) => {
      expect(() => assertPracticeAdmin({ role })).toThrow(PrivacyAuthError);
    },
  );
  it("rejects limited-module admins", () => {
    expect(() => assertPracticeAdmin({ role: "admin", moduleAccess: "payroll" })).toThrow(
      PrivacyAuthError,
    );
  });
  it("isPracticeAdmin handles nullish", () => {
    expect(isPracticeAdmin(null)).toBe(false);
    expect(isPracticeAdmin(undefined)).toBe(false);
  });
});

describe("assertSelfSubject", () => {
  it("passes with no id or the same id", () => {
    expect(() => assertSelfSubject("u1")).not.toThrow();
    expect(() => assertSelfSubject("u1", "u1")).not.toThrow();
  });
  it("rejects another user's id and missing session", () => {
    expect(() => assertSelfSubject("u1", "u2")).toThrow(PrivacyAuthError);
    expect(() => assertSelfSubject("")).toThrow(PrivacyAuthError);
  });
});

describe("confirmation phrases", () => {
  it("normalises case and whitespace", () => {
    expect(normalisePhrase("  delete   my account ")).toBe("DELETE MY ACCOUNT");
    expect(() => assertPhrase(" delete  my account", ERASE_ACCOUNT_PHRASE)).not.toThrow();
  });
  it("rejects wrong or missing phrase", () => {
    expect(() => assertPhrase("delete", ERASE_ACCOUNT_PHRASE)).toThrow(PrivacyAuthError);
    expect(() => assertPhrase(undefined, ERASE_ACCOUNT_PHRASE)).toThrow(PrivacyAuthError);
    expect(() => assertPhrase(null, ERASE_CLIENT_PHRASE)).toThrow(PrivacyAuthError);
  });
});

describe("assertAccountEmailConfirmation", () => {
  it("matches case-insensitively", () => {
    expect(() => assertAccountEmailConfirmation(" A@B.com ", "a@b.com")).not.toThrow();
  });
  it("rejects mismatch and empty account email", () => {
    expect(() => assertAccountEmailConfirmation("x@b.com", "a@b.com")).toThrow(PrivacyAuthError);
    expect(() => assertAccountEmailConfirmation("", null)).toThrow(PrivacyAuthError);
  });
});

describe("classifyPracticeForUserErasure", () => {
  const me = "u1";
  it("sole member", () => {
    expect(classifyPracticeForUserErasure([{ userId: me, role: "owner" }], me)).toBe("sole_member");
  });
  it("last owner with other members is blocked", () => {
    expect(
      classifyPracticeForUserErasure(
        [
          { userId: me, role: "owner" },
          { userId: "u2", role: "practitioner" },
        ],
        me,
      ),
    ).toBe("blocked_transfer_ownership");
  });
  it("co-owner may leave", () => {
    expect(
      classifyPracticeForUserErasure(
        [
          { userId: me, role: "owner" },
          { userId: "u2", role: "owner" },
        ],
        me,
      ),
    ).toBe("leave_only");
  });
  it("non-owner may leave; non-member is not_member", () => {
    expect(
      classifyPracticeForUserErasure(
        [
          { userId: me, role: "practitioner" },
          { userId: "u2", role: "owner" },
        ],
        me,
      ),
    ).toBe("leave_only");
    expect(classifyPracticeForUserErasure([{ userId: "u2", role: "owner" }], me)).toBe("not_member");
  });
});

describe("assertClientErasureConfirmation", () => {
  const ok = {
    phrase: "erase client data",
    typedClientName: "acme ltd",
    clientName: "Acme Ltd",
    acknowledgeStatutory: false,
    holds: [{ kind: "vat_returns", count: 0, description: "x" }],
  };
  it("passes with correct phrase + name and no holds", () => {
    expect(() => assertClientErasureConfirmation(ok)).not.toThrow();
  });
  it("requires exact client name", () => {
    expect(() => assertClientErasureConfirmation({ ...ok, typedClientName: "Acme" })).toThrow(
      PrivacyAuthError,
    );
    expect(() => assertClientErasureConfirmation({ ...ok, typedClientName: "" })).toThrow(
      PrivacyAuthError,
    );
  });
  it("requires the phrase", () => {
    expect(() => assertClientErasureConfirmation({ ...ok, phrase: "yes" })).toThrow(PrivacyAuthError);
  });
  it("requires acknowledgement when statutory holds exist", () => {
    const withHold = { ...ok, holds: [{ kind: "vat_returns", count: 2, description: "x" }] };
    expect(() => assertClientErasureConfirmation(withHold)).toThrow(PrivacyAuthError);
    expect(() => assertClientErasureConfirmation({ ...withHold, acknowledgeStatutory: "true" })).toThrow(
      PrivacyAuthError,
    );
    expect(() => assertClientErasureConfirmation({ ...withHold, acknowledgeStatutory: true })).not.toThrow();
  });
});

describe("deletionDueAt", () => {
  it("adds the grace period", () => {
    const d = deletionDueAt(new Date("2026-11-13T00:00:00Z"), 14);
    expect(d.toISOString()).toBe("2026-11-27T00:00:00.000Z");
  });
});

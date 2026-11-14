import { describe, expect, it } from "vitest";
import {
  capRows,
  exportFilename,
  isSecretKey,
  shapeAuthUser,
  shapeClientExport,
  shapeUserExport,
  stripSecrets,
  type UserExportInput,
} from "@/server/privacy/export-shape";

const entity = { legalName: "Test Ltd", contact: "privacy@example.com" };

function baseUserInput(over: Partial<UserExportInput> = {}): UserExportInput {
  return {
    userId: "u1",
    authUser: null,
    profile: null,
    memberships: [],
    mfaSettings: null,
    emailPreferences: [],
    supportTickets: [],
    featureRequests: [],
    featureVotes: [],
    activityLogs: [],
    auditEvents: [],
    teamInvites: [],
    orders: [],
    securityEvents: [],
    deletionRequests: [],
    gatewayCredentialLinks: [],
    ...over,
  };
}

describe("isSecretKey", () => {
  it.each([
    "password",
    "encrypted_password",
    "code_hash",
    "passwordHash",
    "access_token",
    "refreshToken",
    "token",
    "company_auth_code",
    "companyAuthCode",
    "payroll_pack_password_encrypted",
    "api_key",
    "apiKey",
    "client_secret",
    "otp",
    "pin_hash",
    "private_key",
    "ht_session_cookie",
    "gateway_credentials",
  ])("flags %s", (k) => expect(isSecretKey(k)).toBe(true));

  it.each([
    "email",
    "first_name",
    "stripe_customer_id",
    "created_at",
    "ticket_ref",
    "practice_id",
    "vat_number",
    "nino",
    "author_name",
  ])("keeps %s", (k) => expect(isSecretKey(k)).toBe(false));
});

describe("stripSecrets", () => {
  it("removes nested secrets in objects and arrays without mutating input", () => {
    const input = {
      name: "A",
      password: "x",
      nested: { token: "t", keep: 1, list: [{ api_key: "k", ok: true }] },
    };
    const out = stripSecrets(input);
    expect(out).toEqual({ name: "A", nested: { keep: 1, list: [{ ok: true }] } });
    expect(input.password).toBe("x");
  });

  it("keeps Dates and primitives", () => {
    const d = new Date();
    expect(stripSecrets({ d, n: 1, s: "x", z: null })).toEqual({ d, n: 1, s: "x", z: null });
  });
});

describe("capRows", () => {
  it("caps and tolerates null", () => {
    expect(capRows(Array.from({ length: 10 }, (_, i) => i), 3)).toEqual([0, 1, 2]);
    expect(capRows(null)).toEqual([]);
  });
});

describe("shapeAuthUser", () => {
  it("whitelists fields and never exposes identity tokens or password hash", () => {
    const out = shapeAuthUser({
      id: "u1",
      email: "a@b.com",
      encrypted_password: "$2a$...",
      recovery_token: "r",
      confirmation_token: "c",
      identities: [{ provider: "google", identity_data: { sub: "1" }, id: "x" }],
      user_metadata: { first_name: "A" },
    });
    expect(out).toMatchObject({ id: "u1", email: "a@b.com", sign_in_methods: ["google"] });
    const json = JSON.stringify(out);
    expect(json).not.toContain("$2a$");
    expect(json).not.toContain("recovery_token");
    expect(json).not.toContain("identity_data");
  });
});

describe("shapeUserExport", () => {
  it("never leaks secrets from any section", () => {
    const out = shapeUserExport(
      baseUserInput({
        authUser: { id: "u1", email: "a@b.com", encrypted_password: "H" },
        profile: { id: "u1", first_name: "A", token: "T" },
        mfaSettings: { enabled: true, channel: "phone", phone_e164: "+447", code_hash: "CH" },
        supportTickets: [{ subject: "s", meta: { api_key: "K" } }],
        teamInvites: [{ email: "x@y.z", token: "INV" }],
        gatewayCredentialLinks: [{ practice_id: "p", gateway_password_encrypted: "ENC" }],
        orders: [{ plan_key: "solo", stripe_customer_id: "cus_1" }],
      }),
      entity,
    );
    const json = JSON.stringify(out);
    for (const needle of ["\"H\"", "\"T\"", "\"CH\"", "\"K\"", "INV", "ENC"]) {
      expect(json).not.toContain(needle);
    }
    // legitimate personal data stays
    expect(json).toContain("a@b.com");
    expect(json).toContain("+447");
    expect(json).toContain("cus_1");
    expect(out._meta.controller).toBe("Test Ltd");
    expect(out._meta.notIncluded.length).toBeGreaterThan(0);
  });

  it("contains only the signed-in subject id in metadata", () => {
    const out = shapeUserExport(baseUserInput({ userId: "me" }), entity);
    expect(out._meta.subject).toBe("me");
  });
});

describe("shapeClientExport", () => {
  it("strips HMRC / Companies House / portal secrets", () => {
    const out = shapeClientExport(
      {
        clientId: "c1",
        practiceId: "p1",
        client: {
          id: "c1",
          name: "Acme",
          company_auth_code: "ABC123",
          deskProfile: { portal: { token: "PORTAL", requests: [1] }, note: "ok" },
        },
        employees: [{ nino: "QQ123456C", payroll_pack_password_encrypted: "E" }],
        payRuns: [],
        timesheets: [],
        ledgerEntries: [],
        vatReturns: [{ id: 1, access_token: "AT" }],
        ct600Returns: [],
        saSubmissions: [],
        bankTransactions: [],
        documents: [{ filename: "a.pdf", storage_key: "k" }],
        invoices: [],
        emailLogs: [],
        channelMessages: [],
        tasks: [],
        auditEvents: [{ action: "x", event_hash: "EH" }],
      },
      entity,
    );
    const json = JSON.stringify(out);
    for (const needle of ["ABC123", "PORTAL", "\"E\"", "\"AT\"", "\"EH\""]) {
      expect(json).not.toContain(needle);
    }
    expect(json).toContain("QQ123456C");
    expect(json).toContain("Acme");
    expect(out._meta.clientId).toBe("c1");
    expect(out._meta.practiceId).toBe("p1");
  });
});

describe("exportFilename", () => {
  it("is safe and dated", () => {
    const n = exportFilename("my-data", "../../etc/passwd; rm -rf", new Date("2026-11-13T10:00:00Z"));
    expect(n).toMatch(/^hydratax-my-data-[A-Za-z0-9-]+-2026-11-13\.json$/);
    expect(n).not.toContain("/");
    expect(n).not.toContain("..");
  });
});

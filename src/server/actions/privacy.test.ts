import { beforeEach, describe, expect, it, vi } from "vitest";

const session = {
  userId: "user-1",
  orgId: "org",
  practiceId: "practice-1",
  practiceName: "P",
  role: "owner" as "owner" | "admin" | "practitioner" | "readonly",
  moduleAccess: "full",
  email: "owner@example.com",
  local: false,
};

const deleteClient = vi.fn(async () => ({ ok: true }));
const fetchClientRecord = vi.fn();
const buildClientDataExport = vi.fn(async () => ({ employees: [], documents: [] }));
const collectStatutoryHolds = vi.fn(async () => [] as { kind: string; count: number; description: string }[]);
const countClientResiduals = vi.fn(async () => ({}));
const buildUserDataExport = vi.fn(async (s: { userId: string }) => ({ subject: s.userId }));
const startAccountDeletion = vi.fn();
const appendAuditEvent = vi.fn(async (...args: unknown[]) => {
  void args;
  return { id: "a", eventHash: "h" };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", async (orig) => ({
  ...(await orig<typeof import("@/lib/env")>()),
  isMemoryStore: () => false,
}));
vi.mock("@/server/auth/session", () => ({ requireSession: vi.fn(async () => ({ ...session })) }));
vi.mock("@/server/audit/log", () => ({ appendAuditEvent: (e: unknown) => appendAuditEvent(e) }));
vi.mock("@/server/actions/clients", () => ({
  deleteClient: (...a: unknown[]) => deleteClient(...(a as [])),
  fetchClientRecord: (...a: unknown[]) => fetchClientRecord(...(a as [])),
}));
vi.mock("@/server/privacy/client-data", () => ({
  buildClientDataExport: (...a: unknown[]) => buildClientDataExport(...(a as [])),
  collectStatutoryHolds: (...a: unknown[]) => collectStatutoryHolds(...(a as [])),
  countClientResiduals: (...a: unknown[]) => countClientResiduals(...(a as [])),
}));
vi.mock("@/server/privacy/user-export", () => ({
  buildUserDataExport: (...a: unknown[]) => buildUserDataExport(...(a as [{ userId: string }])),
}));
vi.mock("@/server/privacy/account-deletion", () => ({
  startAccountDeletion: (...a: unknown[]) => startAccountDeletion(...(a as [])),
  cancelAccountDeletionForUser: vi.fn(async () => true),
  logDataSubjectRequest: vi.fn(async () => undefined),
}));
vi.mock("@/server/privacy/security-events", () => ({ logSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: vi.fn(async () => ({})) } })),
}));
vi.mock("@/server/auth/session-policy", () => ({ clearSessionPolicyCookies: vi.fn(async () => undefined) }));

import { resetRateLimits } from "@/lib/rate-limit";
import {
  eraseClientData,
  exportClientData,
  exportMyData,
  requestAccountDeletion,
} from "@/server/actions/privacy";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  session.role = "owner";
  session.moduleAccess = "full";
  session.local = false;
  fetchClientRecord.mockResolvedValue({ id: CLIENT_ID, name: "Acme Ltd", practiceId: "practice-1" });
  collectStatutoryHolds.mockResolvedValue([]);
});

describe("exportMyData", () => {
  it("exports the SESSION user only", async () => {
    const res = await exportMyData();
    expect(res.ok).toBe(true);
    expect(buildUserDataExport).toHaveBeenCalledWith({ userId: "user-1", email: "owner@example.com" });
    // The action takes no subject argument at all.
    expect(exportMyData.length).toBe(0);
  });
});

describe("exportClientData authorisation", () => {
  it.each(["practitioner", "readonly"] as const)("rejects %s", async (role) => {
    session.role = role;
    const res = await exportClientData(CLIENT_ID);
    expect(res.ok).toBe(false);
    expect(buildClientDataExport).not.toHaveBeenCalled();
  });

  it("rejects limited-module admins", async () => {
    session.role = "admin";
    session.moduleAccess = "payroll";
    expect((await exportClientData(CLIENT_ID)).ok).toBe(false);
  });

  it("rejects a client from another practice", async () => {
    fetchClientRecord.mockResolvedValue({ id: CLIENT_ID, name: "X", practiceId: "other-practice" });
    const res = await exportClientData(CLIENT_ID);
    expect(res.ok).toBe(false);
    expect(buildClientDataExport).not.toHaveBeenCalled();
  });

  it("rejects malformed client ids before touching storage", async () => {
    const res = await exportClientData("../../etc");
    expect(res.ok).toBe(false);
    expect(fetchClientRecord).not.toHaveBeenCalled();
  });

  it("exports and audits for an owner", async () => {
    const res = await exportClientData(CLIENT_ID);
    expect(res.ok).toBe(true);
    expect(buildClientDataExport).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: CLIENT_ID, practiceId: "practice-1" }),
    );
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "client.data_export", actorId: "user-1" }),
    );
  });
});

describe("eraseClientData guards", () => {
  const good = {
    clientId: CLIENT_ID,
    confirmPhrase: "ERASE CLIENT DATA",
    confirmClientName: "Acme Ltd",
  };

  it.each(["practitioner", "readonly"] as const)("rejects %s", async (role) => {
    session.role = role;
    expect((await eraseClientData(good)).ok).toBe(false);
    expect(deleteClient).not.toHaveBeenCalled();
  });

  it("requires phrase and exact client name", async () => {
    expect((await eraseClientData({ ...good, confirmPhrase: "yes" })).ok).toBe(false);
    expect((await eraseClientData({ ...good, confirmClientName: "Acme" })).ok).toBe(false);
    expect(deleteClient).not.toHaveBeenCalled();
  });

  it("requires acknowledgement when statutory records exist", async () => {
    collectStatutoryHolds.mockResolvedValue([{ kind: "vat_returns", count: 3, description: "d" }]);
    expect((await eraseClientData(good)).ok).toBe(false);
    expect(deleteClient).not.toHaveBeenCalled();
    expect((await eraseClientData({ ...good, acknowledgeStatutory: true })).ok).toBe(true);
    expect(deleteClient).toHaveBeenCalledWith(CLIENT_ID);
  });

  it("rejects another practice's client", async () => {
    fetchClientRecord.mockResolvedValue({ id: CLIENT_ID, name: "Acme Ltd", practiceId: "other" });
    expect((await eraseClientData(good)).ok).toBe(false);
    expect(deleteClient).not.toHaveBeenCalled();
  });

  it("writes an intent audit event BEFORE deleting, without the client name", async () => {
    const order: string[] = [];
    appendAuditEvent.mockImplementation(async (e: unknown) => {
      order.push(`audit:${(e as { action: string }).action}`);
      return { id: "a", eventHash: "h" };
    });
    deleteClient.mockImplementation(async () => {
      order.push("delete");
      return { ok: true };
    });
    const res = await eraseClientData(good);
    expect(res.ok).toBe(true);
    expect(order.indexOf("audit:client.erase_requested")).toBeLessThan(order.indexOf("delete"));
    for (const call of appendAuditEvent.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("Acme Ltd");
    }
  });
});

describe("requestAccountDeletion guards", () => {
  const good = { confirmPhrase: "DELETE MY ACCOUNT", confirmEmail: "owner@example.com" };

  it("needs the phrase and the account email", async () => {
    expect((await requestAccountDeletion({ ...good, confirmPhrase: "no" })).ok).toBe(false);
    expect((await requestAccountDeletion({ ...good, confirmEmail: "x@y.z" })).ok).toBe(false);
    expect(startAccountDeletion).not.toHaveBeenCalled();
  });

  it("needs explicit acknowledgement for immediate practice erasure", async () => {
    const res = await requestAccountDeletion({ ...good, practiceData: "immediate" });
    expect(res.ok).toBe(false);
    expect(startAccountDeletion).not.toHaveBeenCalled();
  });

  it("is disabled on the local demo desk", async () => {
    session.local = true;
    expect((await requestAccountDeletion(good)).ok).toBe(false);
    expect(startAccountDeletion).not.toHaveBeenCalled();
  });

  it("passes only the SESSION identity to the service", async () => {
    startAccountDeletion.mockResolvedValue({
      mode: "member_only",
      requestId: "r",
      authDeleted: true,
      failedSteps: 0,
      plan: { practices: [], erasePracticeIds: [], blocked: [] },
    });
    const res = await requestAccountDeletion({
      ...good,
      // attacker-supplied extra fields must be ignored
      ...({ userId: "victim", email: "victim@example.com" } as object),
    });
    expect(res.ok).toBe(true);
    expect(startAccountDeletion).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", email: "owner@example.com", practiceData: "schedule" }),
    );
  });
});

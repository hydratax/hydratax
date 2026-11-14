import { afterEach, describe, expect, it } from "vitest";
import {
  buildSecurityEventRow,
  hashIp,
  sanitiseDetails,
} from "@/server/privacy/security-events";

const OLD_SALT = process.env.SECURITY_EVENT_SALT;
afterEach(() => {
  if (OLD_SALT === undefined) delete process.env.SECURITY_EVENT_SALT;
  else process.env.SECURITY_EVENT_SALT = OLD_SALT;
});

describe("security events", () => {
  it("strips secrets from details", () => {
    const d = sanitiseDetails({ reason: "bad", token: "T", nested: { password: "P", ok: 1 } });
    expect(JSON.stringify(d)).not.toContain("\"T\"");
    expect(JSON.stringify(d)).not.toContain("\"P\"");
    expect(d).toMatchObject({ reason: "bad", nested: { ok: 1 } });
  });

  it("truncates oversize details", () => {
    const d = sanitiseDetails({ blob: "x".repeat(10_000) });
    expect(d.truncated).toBe(true);
    expect(JSON.stringify(d).length).toBeLessThan(1000);
  });

  it("stores no IP when no salt is configured, and a stable hash otherwise", () => {
    delete process.env.SECURITY_EVENT_SALT;
    expect(hashIp("203.0.113.9")).toBeNull();
    process.env.SECURITY_EVENT_SALT = "pepper";
    const a = hashIp("203.0.113.9");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).toBe(hashIp("203.0.113.9"));
    expect(a).not.toContain("203");
    expect(hashIp(null)).toBeNull();
  });

  it("builds a row with defaults", () => {
    const row = buildSecurityEventRow({ type: "privacy.data_export", actorUserId: "u1" });
    expect(row).toMatchObject({
      event_type: "privacy.data_export",
      severity: "info",
      actor_user_id: "u1",
      subject_user_id: null,
      ip_hash: null,
    });
  });
});

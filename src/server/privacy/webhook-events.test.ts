import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn(async () => ({ error: null }));
const from = vi.fn(() => ({ insert }));

vi.mock("@/server/privacy/db", () => ({
  privacyAdminClient: () => ({ from }),
}));

import { logWebhookRejection } from "@/server/privacy/webhook-events";

function req(ip: string) {
  const h = new Headers({ "x-forwarded-for": ip });
  return { headers: h };
}

describe("logWebhookRejection", () => {
  beforeEach(() => {
    insert.mockClear();
    from.mockClear();
  });

  it("writes a webhook.signature_failed row with only provider + reason", async () => {
    await logWebhookRejection(req("198.51.100.1"), "stripe", "invalid_signature");
    expect(from).toHaveBeenCalledWith("security_events");
    const row = (insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row.event_type).toBe("webhook.signature_failed");
    expect(row.details).toEqual({ provider: "stripe", reason: "invalid_signature" });
    expect(JSON.stringify(row)).not.toContain("198.51.100.1");
  });

  it("maps unauthorised / not_configured to webhook.unauthorised", async () => {
    await logWebhookRejection(req("198.51.100.2"), "cron", "unauthorised");
    const row = (insert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row.event_type).toBe("webhook.unauthorised");
  });

  it("throttles a flood from one provider + IP", async () => {
    for (let i = 0; i < 25; i++) {
      await logWebhookRejection(req("198.51.100.3"), "whatsapp", "invalid_signature");
    }
    expect(insert.mock.calls.length).toBeLessThanOrEqual(5);
    expect(insert.mock.calls.length).toBeGreaterThan(0);
    // A different IP is not affected by the first one's throttle.
    await logWebhookRejection(req("198.51.100.4"), "whatsapp", "invalid_signature");
    expect(insert.mock.calls.length).toBeGreaterThan(5 - 1);
  });

  it("never throws even if the DB insert rejects", async () => {
    insert.mockRejectedValueOnce(new Error("boom"));
    await expect(
      logWebhookRejection(req("198.51.100.5"), "resend", "missing_signature"),
    ).resolves.toBeUndefined();
  });
});

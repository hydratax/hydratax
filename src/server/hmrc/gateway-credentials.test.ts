import { describe, expect, it, beforeEach } from "vitest";
import { demoStore } from "@/server/demo/store";
import { encryptSecret, decryptSecret } from "@/server/hmrc/crypto";

describe("gateway credential store isolation (demo)", () => {
  beforeEach(() => {
    demoStore.gatewayCredentials = [];
  });

  it("keeps credentials per user+client and never shares across users", () => {
    const now = new Date().toISOString();
    demoStore.gatewayCredentials.push({
      userId: "user-a",
      practiceId: "practice-1",
      clientId: "client-1",
      senderIdEncrypted: encryptSecret("111111111111"),
      passwordEncrypted: encryptSecret("secret-a"),
      updatedAt: now,
    });
    demoStore.gatewayCredentials.push({
      userId: "user-b",
      practiceId: "practice-1",
      clientId: "client-1",
      senderIdEncrypted: encryptSecret("222222222222"),
      passwordEncrypted: encryptSecret("secret-b"),
      updatedAt: now,
    });

    const forA = demoStore.gatewayCredentials.filter(
      (r) => r.userId === "user-a" && r.clientId === "client-1",
    );
    const forB = demoStore.gatewayCredentials.filter(
      (r) => r.userId === "user-b" && r.clientId === "client-1",
    );

    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(1);
    expect(decryptSecret(forA[0]!.senderIdEncrypted)).toBe("111111111111");
    expect(decryptSecret(forB[0]!.senderIdEncrypted)).toBe("222222222222");
    expect(decryptSecret(forA[0]!.passwordEncrypted!)).not.toBe(
      decryptSecret(forB[0]!.passwordEncrypted!),
    );
  });
});

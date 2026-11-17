import { describe, expect, it } from "vitest";
import { formatFromHeader, parseEmailFromHeader } from "@/lib/email/from-header";
import { resolveClientEmailSender } from "@/lib/client-email";
import type { SessionContext } from "@/server/auth/session";

describe("from-header", () => {
  it("parses name and address", () => {
    expect(parseEmailFromHeader('HydraTax <info@hydratax.uk>')).toEqual({
      name: "HydraTax",
      address: "info@hydratax.uk",
    });
    expect(parseEmailFromHeader("info@hydratax.uk").address).toBe(
      "info@hydratax.uk",
    );
  });

  it("formats practice-branded From", () => {
    expect(formatFromHeader("Acme Accountants Ltd", "info@hydratax.uk")).toBe(
      '"Acme Accountants Ltd" <info@hydratax.uk>',
    );
  });
});

describe("resolveClientEmailSender", () => {
  const session = {
    practiceId: "p1",
    practiceName: "Hydra Consultancy Services Ltd",
    email: "owner@example.com",
    userId: "u1",
    role: "owner",
  } as SessionContext;

  it("uses practice name on HydraTax domain with Reply-To (middle option)", () => {
    const prev = process.env.EMAIL_FROM;
    process.env.EMAIL_FROM = "HydraTax <info@hydratax.uk>";
    try {
      const s = resolveClientEmailSender(session, {
        practiceEmail: "haidary555@yahoo.com",
        practiceName: "Hydra Consultancy Services Ltd",
      });
      expect(s.mode).toBe("hydra_branded");
      expect(s.from).toBe(
        '"Hydra Consultancy Services Ltd" <info@hydratax.uk>',
      );
      expect(s.replyTo).toBe("haidary555@yahoo.com");
    } finally {
      if (prev === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = prev;
    }
  });

  it("prefers connected mailbox when present", () => {
    const s = resolveClientEmailSender(session, {
      practiceEmail: "haidary555@yahoo.com",
      connectedMailbox: {
        address: "firm@gmail.com",
        displayName: "Hydra Consultancy",
      },
    });
    expect(s.mode).toBe("connected_mailbox");
    expect(s.from).toContain("firm@gmail.com");
    expect(s.replyTo).toBe("firm@gmail.com");
  });
});

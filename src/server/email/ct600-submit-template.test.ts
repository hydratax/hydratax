import { describe, expect, it } from "vitest";
import { ct600SubmitEmailContent } from "./ct600-submit-template";

describe("ct600SubmitEmailContent", () => {
  it("builds acceptance email with correlation id", () => {
    const mail = ct600SubmitEmailContent({
      companyName: "HYDRA CONSULTANCY SERVICES LTD",
      companyNumber: "14633422",
      utr: "8612814429",
      periodStart: "2024-03-01",
      periodEnd: "2025-02-28",
      accepted: true,
      correlationId: "abc-123",
      clientId: "00000000-0000-0000-0000-000000000001",
      appUrl: "https://hydratax.uk",
    });
    expect(mail.subject).toContain("CT600 accepted");
    expect(mail.text).toContain("abc-123");
    expect(mail.html).toContain("Corporation Tax return accepted");
  });

  it("builds rejection email with error message", () => {
    const mail = ct600SubmitEmailContent({
      companyName: "Example Ltd",
      companyNumber: "12345678",
      utr: "1234567890",
      periodStart: "2024-04-01",
      periodEnd: "2025-03-31",
      accepted: false,
      errorMessage: "Invalid UTR",
      clientId: "client-1",
      appUrl: "https://hydratax.uk",
    });
    expect(mail.subject).toContain("submission failed");
    expect(mail.text).toContain("Invalid UTR");
  });
});

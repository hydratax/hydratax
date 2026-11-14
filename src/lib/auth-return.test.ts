import { describe, expect, it } from "vitest";
import {
  appendReturnParams,
  authEntryHref,
  safeReturnPath,
} from "@/lib/auth-return";

describe("auth-return", () => {
  it("appends step=submit to return path", () => {
    expect(
      appendReturnParams("/companies-house/accounts-ixbrl?company=123&resume=1", {
        step: "submit",
      }),
    ).toBe("/companies-house/accounts-ixbrl?company=123&resume=1&step=submit");
  });

  it("builds sign-in href with encoded next", () => {
    const href = authEntryHref(
      "sign-in",
      "/companies-house/accounts-ixbrl?company=123&resume=1",
      { step: "submit" },
    );
    expect(href).toMatch(/^\/sign-in\?next=/);
    expect(decodeURIComponent(href.split("next=")[1] ?? "")).toContain(
      "step=submit",
    );
  });

  it("rejects unsafe return paths", () => {
    expect(safeReturnPath("//evil.com")).toBe("/dashboard");
    expect(safeReturnPath("/clients/abc/year-end")).toBe(
      "/clients/abc/year-end",
    );
  });

  describe("safeReturnPath hardening", () => {
    const FALLBACK = "/dashboard";

    it.each([
      ["protocol-relative", "//evil.com"],
      ["triple slash", "///evil.com"],
      ["backslash after slash", "/\\evil.com"],
      ["slash backslash slash", "/\\/evil.com"],
      ["leading backslash", "\\evil.com"],
      ["absolute https URL", "https://evil.com/x"],
      ["javascript scheme", "javascript:alert(1)"],
      ["no leading slash", "evil.com"],
      ["tab smuggling", "/\t/evil.com"],
      ["newline smuggling", "/\n/evil.com"],
      ["carriage return", "/\r/evil.com"],
      ["NUL byte", "/a\u0000b"],
      ["encoded slash path", "/%2Fevil.com"],
      ["encoded backslash path", "/%5Cevil.com"],
      ["encoded backslash lower", "/%5cevil.com"],
      ["double slash after decode", "/a/%2f%2fevil.com"],
      ["malformed percent escape", "/%E0%A4%A"],
      ["backslash in query", "/ok?x=\\evil"],
    ])("rejects %s", (_label, input) => {
      expect(safeReturnPath(input)).toBe(FALLBACK);
    });

    it("rejects over-long values", () => {
      expect(safeReturnPath(`/${"a".repeat(2100)}`)).toBe(FALLBACK);
    });

    it("rejects empty, null and undefined", () => {
      expect(safeReturnPath("")).toBe(FALLBACK);
      expect(safeReturnPath(null)).toBe(FALLBACK);
      expect(safeReturnPath(undefined)).toBe(FALLBACK);
    });

    it("honours a custom fallback", () => {
      expect(safeReturnPath("//evil.com", "/sign-in")).toBe("/sign-in");
    });

    it.each([
      "/dashboard",
      "/clients/abc/year-end?tab=bs#top",
      "/companies-house/accounts-ixbrl?company=123&resume=1",
      "/search?q=%2Fnot-a-path",
    ])("accepts same-origin path %s", (input) => {
      expect(safeReturnPath(input)).toBe(input);
    });
  });
});

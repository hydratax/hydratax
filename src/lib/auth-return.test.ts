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
});

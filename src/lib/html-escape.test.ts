import { describe, expect, it } from "vitest";
import { escapeHtml, safeUrl } from "./html-escape";

describe("escapeHtml", () => {
  it("escapes markup and quotes", () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;",
    );
  });
  it("handles null/undefined/numbers", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(12)).toBe("12");
  });
});

describe("safeUrl", () => {
  it("allows http(s), mailto and root-relative", () => {
    expect(safeUrl("https://hydratax.uk/x")).toBe("https://hydratax.uk/x");
    expect(safeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeUrl("/blog")).toBe("/blog");
  });
  it("blocks javascript:, data:, protocol-relative", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("#");
    expect(safeUrl("data:text/html,<script>")).toBe("#");
    expect(safeUrl("//evil.example")).toBe("#");
    expect(safeUrl("")).toBe("#");
  });
});

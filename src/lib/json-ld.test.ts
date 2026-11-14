import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./json-ld";

describe("safeJsonLd", () => {
  it("neutralises a </script><img onerror> breakout", () => {
    const payload = {
      name: '</script><img src=x onerror="alert(1)">',
      desc: "<!-- & -->",
    };
    const out = safeJsonLd(payload);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out.toLowerCase()).not.toContain("</script");
    // Still valid JSON that round-trips to the original value.
    expect(JSON.parse(out)).toEqual(payload);
  });

  it("escapes & and the JS line separators", () => {
    const out = safeJsonLd({ a: "x&y\u2028z\u2029" });
    expect(out).not.toMatch(/[\u2028\u2029&]/);
    expect(JSON.parse(out)).toEqual({ a: "x&y\u2028z\u2029" });
  });

  it("leaves ordinary data intact", () => {
    expect(JSON.parse(safeJsonLd({ "@type": "Organization", n: 1 }))).toEqual({
      "@type": "Organization",
      n: 1,
    });
  });
});

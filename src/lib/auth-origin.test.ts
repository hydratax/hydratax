import { describe, expect, it } from "vitest";
import {
  classifyOAuthCallbackFailure,
  resolveAuthOrigin,
} from "./auth-origin";

describe("resolveAuthOrigin", () => {
  it("prefers NEXT_PUBLIC_APP_URL when Host matches the app domain", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://hydratax.uk";
    const origin = resolveAuthOrigin({
      headers: new Headers({
        host: "hydratax.uk",
        "x-forwarded-host": "main--hydratax.netlify.app",
      }),
      nextUrl: { origin: "https://main--hydratax.netlify.app" },
    });
    expect(origin).toBe("https://hydratax.uk");
  });

  it("uses Host over netlify.app forwarded host", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const origin = resolveAuthOrigin({
      headers: new Headers({
        host: "hydratax.uk",
        "x-forwarded-host": "hydratax.netlify.app",
        "x-forwarded-proto": "https",
      }),
      nextUrl: { origin: "https://hydratax.netlify.app" },
    });
    expect(origin).toBe("https://hydratax.uk");
  });
});

describe("classifyOAuthCallbackFailure", () => {
  it("detects account and PKCE failures", () => {
    expect(classifyOAuthCallbackFailure("User already registered")).toBe(
      "account_exists",
    );
    expect(
      classifyOAuthCallbackFailure(
        "invalid request: both auth code and code verifier should be non-empty",
      ),
    ).toBe("pkce");
    expect(classifyOAuthCallbackFailure("something else")).toBe("auth");
  });
});

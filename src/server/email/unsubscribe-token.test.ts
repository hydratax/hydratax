import { describe, expect, it } from "vitest";
import { isPlausibleUnsubscribeToken } from "./unsubscribe";

describe("isPlausibleUnsubscribeToken", () => {
  it("accepts a high-entropy url-safe token", () => {
    expect(isPlausibleUnsubscribeToken("Zk3_9vQe-1LpXr7TnB0wYc5HsDg2UaMj")).toBe(true);
  });
  it("rejects short, low-entropy, wrong-charset and non-string input", () => {
    expect(isPlausibleUnsubscribeToken("abc")).toBe(false);
    expect(isPlausibleUnsubscribeToken("a".repeat(40))).toBe(false);
    expect(isPlausibleUnsubscribeToken("0123012301230123012301230123012301230123")).toBe(false);
    expect(isPlausibleUnsubscribeToken("Zk3_9vQe-1LpXr7TnB0wYc5HsDg2UaM!")).toBe(false);
    expect(isPlausibleUnsubscribeToken("x".repeat(200))).toBe(false);
    expect(isPlausibleUnsubscribeToken(undefined)).toBe(false);
    expect(isPlausibleUnsubscribeToken(12345)).toBe(false);
  });
});

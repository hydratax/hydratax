import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHmrcState,
  hmrcReturnPath,
  isHmrcClientUuid,
  parseHmrcReturnTo,
  verifyHmrcState,
} from "@/server/hmrc/oauth-state";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T0 = 1_800_000_000_000;

describe("HMRC OAuth state", () => {
  beforeEach(() => {
    vi.stubEnv("HMRC_STATE_SECRET", "test-hmrc-state-secret-0123456789");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a freshly minted state with its own cookie", () => {
    const { state, cookieValue } = createHmrcState({
      clientId: CLIENT,
      returnTo: "vat",
      userId: USER,
      nowMs: T0,
    });
    const payload = verifyHmrcState(state, cookieValue, USER, T0 + 1000);
    expect(payload).toMatchObject({
      clientId: CLIENT,
      returnTo: "vat",
      userId: USER,
    });
  });

  it("rejects when the cookie is missing (state forged/replayed elsewhere)", () => {
    const { state } = createHmrcState({
      clientId: CLIENT,
      returnTo: "overview",
      userId: USER,
      nowMs: T0,
    });
    expect(verifyHmrcState(state, undefined, USER, T0)).toBeNull();
    expect(verifyHmrcState(state, "", USER, T0)).toBeNull();
  });

  it("rejects a nonce cookie from a different authorize flow", () => {
    const a = createHmrcState({ clientId: CLIENT, returnTo: "vat", userId: USER, nowMs: T0 });
    const b = createHmrcState({ clientId: CLIENT, returnTo: "vat", userId: USER, nowMs: T0 });
    expect(verifyHmrcState(a.state, b.cookieValue, USER, T0)).toBeNull();
  });

  it("rejects a different signed-in user", () => {
    const { state, cookieValue } = createHmrcState({
      clientId: CLIENT,
      returnTo: "vat",
      userId: USER,
      nowMs: T0,
    });
    expect(verifyHmrcState(state, cookieValue, OTHER, T0)).toBeNull();
  });

  it("rejects an expired state (10 minute window)", () => {
    const { state, cookieValue } = createHmrcState({
      clientId: CLIENT,
      returnTo: "vat",
      userId: USER,
      nowMs: T0,
    });
    expect(verifyHmrcState(state, cookieValue, USER, T0 + 599_000)).not.toBeNull();
    expect(verifyHmrcState(state, cookieValue, USER, T0 + 600_000)).toBeNull();
  });

  it("rejects a tampered payload (swapped clientId) even with a valid-looking signature", () => {
    const { state, cookieValue } = createHmrcState({
      clientId: CLIENT,
      returnTo: "vat",
      userId: USER,
      nowMs: T0,
    });
    const [body, sig] = state.split(".") as [string, string];
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    json.c = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const forgedBody = Buffer.from(JSON.stringify(json)).toString("base64url");
    expect(verifyHmrcState(`${forgedBody}.${sig}`, cookieValue, USER, T0)).toBeNull();
  });

  it("rejects a tampered signature and malformed state", () => {
    const { state, cookieValue } = createHmrcState({
      clientId: CLIENT,
      returnTo: "vat",
      userId: USER,
      nowMs: T0,
    });
    expect(verifyHmrcState(`${state}x`, cookieValue, USER, T0)).toBeNull();
    expect(verifyHmrcState("not-a-state", cookieValue, USER, T0)).toBeNull();
    expect(verifyHmrcState("a.b.c", cookieValue, USER, T0)).toBeNull();
    expect(verifyHmrcState(state, "nonce.badsig", USER, T0)).toBeNull();
  });

  it("rejects a state signed under a different secret", () => {
    const { state, cookieValue } = createHmrcState({
      clientId: CLIENT,
      returnTo: "vat",
      userId: USER,
      nowMs: T0,
    });
    vi.stubEnv("HMRC_STATE_SECRET", "another-secret-entirely-9876543210");
    expect(verifyHmrcState(state, cookieValue, USER, T0)).toBeNull();
  });

  it("refuses a non-UUID client id when minting", () => {
    expect(() =>
      createHmrcState({ clientId: "../../etc/passwd", returnTo: "vat", userId: USER }),
    ).toThrow();
  });

  it("validates UUIDs and returnTo", () => {
    expect(isHmrcClientUuid(CLIENT)).toBe(true);
    expect(isHmrcClientUuid("x")).toBe(false);
    expect(isHmrcClientUuid(undefined)).toBe(false);
    expect(parseHmrcReturnTo("vat")).toBe("vat");
    expect(parseHmrcReturnTo("https://evil.com")).toBe("overview");
  });

  it("builds only fixed redirect paths", () => {
    expect(hmrcReturnPath(CLIENT, "vat", "connected")).toBe(
      `/clients/${CLIENT}/vat?hmrc=connected`,
    );
    expect(hmrcReturnPath(CLIENT, "overview", "access_denied")).toBe(
      `/clients/${CLIENT}?hmrc=access_denied`,
    );
    expect(hmrcReturnPath("//evil.com", "vat", "connected")).toBe("/settings/hmrc");
  });
});

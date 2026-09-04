import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  CH_XML_GATEWAY_LIVE_URL,
  CH_XML_GATEWAY_TEST_URL,
  classifyChXmlGatewayUrl,
  getChFilingEnv,
  getChXmlGatewayEnvMismatch,
  resolveChXmlGatewayUrl,
} from "./config";

const KEYS = [
  "COMPANIES_HOUSE_ENV",
  "COMPANIES_HOUSE_XML_GATEWAY_URL",
  "COMPANIES_HOUSE_PRESENTER_ID",
  "COMPANIES_HOUSE_PRESENTER_AUTH_CODE",
  "COMPANIES_HOUSE_CREDIT_ACCOUNT",
  "COMPANIES_HOUSE_PACKAGE_REFERENCE",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("classifyChXmlGatewayUrl", () => {
  it("detects live and sandpit hosts", () => {
    expect(classifyChXmlGatewayUrl(CH_XML_GATEWAY_LIVE_URL)).toBe("live");
    expect(classifyChXmlGatewayUrl(CH_XML_GATEWAY_TEST_URL)).toBe("test");
  });
});

describe("resolveChXmlGatewayUrl", () => {
  it("pairs live env with live gateway and test env with sandpit", () => {
    expect(resolveChXmlGatewayUrl({ live: true }).url).toBe(
      CH_XML_GATEWAY_LIVE_URL,
    );
    expect(resolveChXmlGatewayUrl({ live: false }).url).toBe(
      CH_XML_GATEWAY_TEST_URL,
    );
  });

  it("allows an explicit override URL", () => {
    const url = resolveChXmlGatewayUrl({
      live: true,
      overrideUrl: CH_XML_GATEWAY_TEST_URL,
    });
    expect(url.url).toBe(CH_XML_GATEWAY_TEST_URL);
    expect(url.override).toBe(true);
  });
});

describe("getChXmlGatewayEnvMismatch", () => {
  it("flags live env pointed at sandpit", () => {
    expect(
      getChXmlGatewayEnvMismatch({
        live: true,
        url: CH_XML_GATEWAY_TEST_URL,
      }),
    ).toMatch(/live but XML gateway URL is a test/i);
  });

  it("flags test env pointed at live", () => {
    expect(
      getChXmlGatewayEnvMismatch({
        live: false,
        url: CH_XML_GATEWAY_LIVE_URL,
      }),
    ).toMatch(/test but XML gateway URL is the live/i);
  });

  it("returns null when aligned", () => {
    expect(
      getChXmlGatewayEnvMismatch({
        live: true,
        url: CH_XML_GATEWAY_LIVE_URL,
      }),
    ).toBeNull();
    expect(
      getChXmlGatewayEnvMismatch({
        live: false,
        url: CH_XML_GATEWAY_TEST_URL,
      }),
    ).toBeNull();
  });
});

describe("getChFilingEnv pairing", () => {
  it("uses live socket without GatewayTest when ENV=live", () => {
    process.env.COMPANIES_HOUSE_ENV = "live";
    const cfg = getChFilingEnv();
    expect(cfg.label).toBe("live");
    expect(cfg.xmlGatewayUrl).toBe(CH_XML_GATEWAY_LIVE_URL);
    expect(cfg.xmlGatewayHostKind).toBe("live");
    expect(cfg.gatewayTest).toBe(false);
    expect(cfg.gatewayMismatch).toBeNull();
  });

  it("uses sandpit socket with GatewayTest when ENV=test", () => {
    process.env.COMPANIES_HOUSE_ENV = "test";
    const cfg = getChFilingEnv();
    expect(cfg.label).toBe("test");
    expect(cfg.xmlGatewayUrl).toBe(CH_XML_GATEWAY_TEST_URL);
    expect(cfg.xmlGatewayHostKind).toBe("test");
    expect(cfg.gatewayTest).toBe(true);
    expect(cfg.gatewayMismatch).toBeNull();
  });

  it("reports mismatch when override crosses environments", () => {
    process.env.COMPANIES_HOUSE_ENV = "live";
    process.env.COMPANIES_HOUSE_XML_GATEWAY_URL = CH_XML_GATEWAY_TEST_URL;
    const cfg = getChFilingEnv();
    expect(cfg.gatewayMismatch).toMatch(/live but XML gateway URL is a test/i);
  });
});

import { appendAuditEvent } from "@/server/audit/log";
import { getHmrcConfig } from "@/server/hmrc/config";
import { extractGovTalkErrorMessage } from "@/server/hmrc/ct600/xml-utils";
import { sha256Hex } from "@/server/hmrc/crypto";
import { buildCt600Package } from "@/server/hmrc/ct600/build-envelope";
import { assertCt600PackageValid } from "@/server/hmrc/ct600/validate-package";
import { assertCt600XmlStructure } from "@/server/hmrc/ct600/validate-xml-structure";
import { submitAndPollCt600Xml } from "@/server/hmrc/ct600/poll";
import type { Ct600PackageInput } from "@/server/hmrc/ct600/types";

export async function submitCt600Xml(opts: {
  xml: string;
  actorId: string;
  clientId: string;
  practiceId?: string;
  demo?: boolean;
  utr?: string;
  senderId?: string;
  senderPassword?: string;
}) {
  const cfg = getHmrcConfig();
  const hash = sha256Hex(opts.xml);

  // CT Online uses Transaction Engine + Government Gateway — not MTD OAuth clientId.
  if (opts.demo) {
    const correlationId = `demo-ct600-${Date.now()}`;
    await appendAuditEvent({
      practiceId: opts.practiceId,
      clientId: opts.clientId,
      actorId: opts.actorId,
      action: "hmrc.ct600.submit.demo",
      entityType: "ct600_return",
      entityId: opts.clientId,
      payloadHash: hash,
      hmrcStatusCode: 200,
      hmrcCorrelationId: correlationId,
      detail: { mode: "demo", env: cfg.env },
    });
    return {
      ok: true,
      status: 200,
      correlationId,
      receipt: "DEMO_ACCEPTANCE",
      hash,
    };
  }

  if (!cfg.ctVendorId) {
    throw new Error(
      "HMRC_CT_VENDOR_ID is not configured. Add your SDST Vendor ID before live CT600 submit.",
    );
  }

  const utr = (opts.utr ?? "").replace(/\s+/g, "");
  if (!/^\d{10}$/.test(utr)) {
    throw new Error("A valid 10-digit company UTR is required for CT600 submit.");
  }

  const senderId =
    opts.senderId?.trim() ||
    (cfg.env === "production" ? "" : cfg.ctTestSenderId);
  const senderPassword =
    opts.senderPassword?.trim() ||
    (cfg.env === "production" ? "" : cfg.ctTestPassword);

  if (!senderId || !senderPassword) {
    throw new Error(
      cfg.env === "production"
        ? "Enter the client's Government Gateway User ID and password to submit live CT600."
        : "ETS test credentials missing — set HMRC_CT_TEST_SENDER_ID / PASSWORD or enter them at submit.",
    );
  }

  assertCt600XmlStructure(opts.xml);

  const polled = await submitAndPollCt600Xml({
    xml: opts.xml,
    utr,
    senderId,
    senderPassword,
  });

  const receipt = polled.pollResponse ?? polled.submitResponse;
  const errorMessage = polled.ok
    ? null
    : extractGovTalkErrorMessage(receipt);

  await appendAuditEvent({
    practiceId: opts.practiceId,
    clientId: opts.clientId,
    actorId: opts.actorId,
    action: polled.ok ? "hmrc.ct600.submit" : "hmrc.ct600.submit.error",
    entityType: "ct600_return",
    entityId: opts.clientId,
    payloadHash: hash,
    hmrcStatusCode: polled.status,
    hmrcCorrelationId: polled.correlationId,
    detail: {
      qualifier: polled.qualifier,
      responseSnippet: receipt.slice(0, 2000),
      env: cfg.env,
      gatewayTest: cfg.env !== "production",
    },
  });

  return {
    ok: polled.ok,
    status: polled.status,
    correlationId: polled.correlationId,
    receipt: receipt.slice(0, 4000),
    errorMessage,
    hash,
  };
}

export async function submitCt600Package(
  input: Ct600PackageInput & {
    actorId: string;
    clientId: string;
    practiceId?: string;
    demo?: boolean;
  },
) {
  assertCt600PackageValid(input);
  const built = buildCt600Package(input, { strict: true });
  if (!built.validation.ok) {
    const first = built.validation.issues.find((i) => i.blocking);
    throw new Error(first?.message ?? "CT600 package is not valid.");
  }
  assertCt600XmlStructure(built.xml);
  return submitCt600Xml({
    xml: built.xml,
    actorId: input.actorId,
    clientId: input.clientId,
    practiceId: input.practiceId,
    demo: input.demo,
    utr: input.utr,
    senderId: input.senderId,
    senderPassword: input.senderPassword,
  });
}

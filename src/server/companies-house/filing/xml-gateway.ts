import type { ParsedCsFilingInput } from "./personal-codes";
import { getChFilingEnv } from "./config";
import { buildFormSubmissionEnvelope } from "./form-envelope";
import { buildCs01FormBody, resolveCs01MessageClass } from "./cs01-xml";
import { logChGatewayXmlPayload } from "./ch-xml-log";
import { validatePresenterCredentials } from "./gateway-auth";

/**
 * Builds a CS01 XML payload for the Companies House software filing gateway.
 *
 * Class + FormIdentifier always match the root form element
 * (ConfirmationAndVerificationStatement when personal codes are present).
 */
export function buildConfirmationStatementXml(input: ParsedCsFilingInput) {
  getChFilingEnv();
  const formClass = resolveCs01MessageClass(input);
  const formBody = buildCs01FormBody(input);
  return buildFormSubmissionEnvelope({
    messageClass: formClass,
    formIdentifier: formClass,
    companyNumber: input.companyNumber,
    companyName: input.companyName,
    companyAuthCode: input.companyAuthCode,
    formBody,
  });
}

export type XmlGatewayResponse = {
  ok: boolean;
  submissionNumber?: string;
  raw?: string;
  error?: string;
};

export async function submitConfirmationStatementXml(
  xml: string,
): Promise<XmlGatewayResponse> {
  return postXmlToGateway(xml, "CS01");
}

export async function submitCompanyIncorporationXml(
  xml: string,
): Promise<XmlGatewayResponse> {
  return postXmlToGateway(xml, "IN01");
}

export async function postXmlToGateway(
  xml: string,
  label = "CH",
): Promise<XmlGatewayResponse> {
  const cfg = getChFilingEnv();
  const presenterCheck = validatePresenterCredentials();
  if (!presenterCheck.ok) {
    return { ok: false, error: presenterCheck.error };
  }
  if (cfg.live && !cfg.creditAccountNumber) {
    return {
      ok: false,
      error:
        "Companies House credit account is required for fee-bearing filings (CS01). Contact support.",
    };
  }

  const bodyMatch = xml.match(/<Body>([\s\S]*?)<\/Body>/i);
  if (
    !bodyMatch ||
    !/<FormSubmission/i.test(bodyMatch[1] ?? "") ||
    bodyMatch[1]!.replace(/\s+/g, "").length === 0
  ) {
    return {
      ok: false,
      error:
        "CS01 XML envelope is incomplete — FormSubmission body is missing. Contact support.",
    };
  }

  if (cfg.gatewayMismatch) {
    return {
      ok: false,
      error: cfg.gatewayMismatch,
    };
  }

  logChGatewayXmlPayload(label, xml);
  console.info(
    `[ch.gateway] ${label} env=${cfg.label} host=${cfg.xmlGatewayHostKind} url=${cfg.xmlGatewayUrl} gatewayTest=${cfg.gatewayTest ? 1 : 0}`,
  );

  try {
    const res = await fetch(cfg.xmlGatewayUrl, {
      method: "POST",
      headers: {
        // CH interface spec: Content-Type text/xml
        "Content-Type": "text/xml",
        Accept: "application/xml, text/xml",
      },
      body: xml,
    });
    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: "Companies House could not accept the filing. Contact support.",
        raw: raw.slice(0, 2000),
      };
    }
    const fatal = raw.match(
      /<Number>(\d+)<\/Number>[\s\S]*?<Type>fatal<\/Type>/i,
    );
    const errorText = raw.match(/<Text>([^<]+)<\/Text>/i);
    if (fatal || /Authorisation Failure|fatal/i.test(raw)) {
      const chMessage = errorText?.[1]?.trim();
      return {
        ok: false,
        error: mapChError(chMessage),
        raw: raw.slice(0, 2000),
      };
    }
    const submissionMatch = raw.match(
      /<SubmissionNumber>([^<]+)<\/SubmissionNumber>/i,
    );
    return {
      ok: true,
      submissionNumber: submissionMatch?.[1],
      raw: raw.slice(0, 2000),
    };
  } catch {
    return {
      ok: false,
      error: "Could not reach Companies House. Try again or contact support.",
    };
  }
}

function mapChError(message?: string) {
  if (!message) {
    return "Companies House rejected the confirmation statement.";
  }
  if (/Authorisation Failure/i.test(message)) {
    return "Companies House authorisation failed — check the company authentication code and that presenter credentials are active.";
  }
  return message;
}

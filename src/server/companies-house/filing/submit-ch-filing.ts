import { isChXmlGatewayConfigured } from "./config";
import { submitIncorporationFiling } from "./incorporation";
import {
  createCsFilingDraft,
  submitCsFiling,
} from "./confirmation-statement";
import {
  parseCsSicCodes,
  parseCsStatementOfCapital,
  resolveCsRegisteredEmail,
} from "./cs01-payload";
import { submitAccountsFromPayload } from "./accounts-filing";
import {
  buildChangeOfNameXml,
  buildOfficerAppointmentXml,
  buildOfficerTerminationXml,
  buildPscCessationXml,
  buildPscChangeXml,
  buildPscNotificationXml,
  buildReturnOfAllotmentXml,
  buildStrikeOffApplicationXml,
  submitChFormXml,
} from "./company-forms-xml";
import type { MemoryChRequest } from "@/server/demo/store";

export type ChFilingSubmitResult = {
  ok: boolean;
  submissionNumber?: string | null;
  filingId?: string;
  error?: string;
  mode?: "xml_gateway" | "dry_run" | "queued";
};

function str(payload: Record<string, unknown>, key: string) {
  const val = payload[key];
  return typeof val === "string" ? val.trim() : "";
}

function parseDirectors(payload: Record<string, unknown>) {
  const raw = payload.directorsJson;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      fullName?: string;
      dateOfBirth?: string;
      personalCode?: string;
    }>;
    return parsed
      .filter((d) => d.fullName && d.dateOfBirth && d.personalCode)
      .map((d) => ({
        fullName: String(d.fullName).trim(),
        dateOfBirth: String(d.dateOfBirth).trim(),
        personalCode: String(d.personalCode).trim().toUpperCase(),
      }));
  } catch {
    return [];
  }
}

async function resolveCompanyAuthCode(
  payload: Record<string, unknown>,
): Promise<string> {
  const clientId = str(payload, "clientId");
  if (clientId) {
    try {
      const { getClient } = await import("@/server/actions/clients");
      const client = await getClient(clientId);
      const fromClient = client.companyAuthCode?.trim().toUpperCase() ?? "";
      if (fromClient) return fromClient;
    } catch {
      /* fall through */
    }
  }
  return str(payload, "companyAuthCode").toUpperCase();
}

async function submitConfirmationStatement(
  record: MemoryChRequest,
  customerEmail?: string | null,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const directors = parseDirectors(payload);
  if (directors.length === 0) {
    return { ok: false, error: "Director personal codes missing from request." };
  }

  const companyAuthCode = await resolveCompanyAuthCode(payload);
  if (!companyAuthCode) {
    return {
      ok: false,
      error:
        "Company authentication code missing — add it on the client record or at checkout.",
    };
  }

  const registeredEmail = resolveCsRegisteredEmail(payload, customerEmail);
  if (!registeredEmail) {
    return {
      ok: false,
      error:
        "Registered email address is required for confirmation statements (ECCTA).",
    };
  }

  const draft = await createCsFilingDraft({
    companyNumber: str(payload, "companyNumber") || record.companyNumber || "",
    companyName: str(payload, "companyName"),
    confirmationDate: str(payload, "confirmationDate"),
    companyAuthCode,
    registeredEmail,
    lawfulPurposeConfirmed: true,
    sicCodes: parseCsSicCodes(payload),
    statementOfCapital: parseCsStatementOfCapital(payload),
    directors,
    clientId: str(payload, "clientId"),
    practiceId: record.practiceId,
  });

  if (!draft.ok) {
    return {
      ok: false,
      error: draft.error ?? "Could not prepare confirmation statement filing.",
    };
  }
  if (!draft.filingId) {
    return {
      ok: false,
      error: "Could not prepare confirmation statement filing.",
    };
  }

  const filed = await submitCsFiling(draft.filingId);
  if (!filed.ok) {
    return {
      ok: false,
      error: filed.error ?? "Companies House rejected the confirmation statement.",
      filingId: draft.filingId,
    };
  }

  if (filed.mode !== "xml_gateway" || filed.status !== "submitted") {
    return {
      ok: false,
      error:
        filed.mode === "dry_run"
          ? "Companies House presenter credentials are not configured on this environment — live submit is disabled."
          : (filed.message ??
            "Confirmation statement was not submitted to Companies House."),
      filingId: draft.filingId,
      mode: filed.mode,
    };
  }

  return {
    ok: true,
    filingId: draft.filingId,
    submissionNumber: filed.submissionNumber ?? null,
    mode: "xml_gateway",
  };
}

async function submitIncorporation(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const filingId = str(payload, "filingId");
  if (!filingId) {
    return {
      ok: false,
      error: "Incorporation package not found — complete the wizard before paying.",
    };
  }

  const filed = await submitIncorporationFiling(filingId, { dryRun: false });
  if (!filed.ok) {
    return {
      ok: false,
      error: filed.error ?? "Companies House rejected the incorporation.",
      filingId,
    };
  }

  if (filed.mode !== "xml_gateway" || filed.status !== "submitted") {
    return {
      ok: false,
      error:
        filed.mode === "dry_run"
          ? "Companies House presenter credentials are not configured on this environment — live submit is disabled."
          : (filed.message ?? "Incorporation was not submitted to Companies House."),
      filingId,
      mode: filed.mode,
    };
  }

  return {
    ok: true,
    filingId,
    submissionNumber: filed.submissionNumber ?? null,
    mode: "xml_gateway",
  };
}

async function submitWithCompanyAuth(
  record: MemoryChRequest,
  build: (authCode: string) => string,
  rejectLabel: string,
): Promise<ChFilingSubmitResult> {
  if (!isChXmlGatewayConfigured()) {
    return {
      ok: false,
      mode: "dry_run",
      error:
        "Companies House presenter credentials are not configured on this environment — live submit is disabled.",
    };
  }

  const payload = record.payload ?? {};
  const companyAuthCode = await resolveCompanyAuthCode(payload);
  if (!companyAuthCode) {
    return {
      ok: false,
      error:
        "Company authentication code missing — add it on the client record or at checkout.",
    };
  }

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;
  if (!companyNumber) {
    return { ok: false, error: "Company number is required." };
  }

  const xml = build(companyAuthCode);
  const result = await submitChFormXml(xml);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? `Companies House rejected the ${rejectLabel}.`,
      mode: "xml_gateway",
    };
  }

  return {
    ok: true,
    submissionNumber: result.submissionNumber ?? null,
    mode: "xml_gateway",
  };
}

async function submitChangeOfName(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const newName = str(payload, "newName");
  if (!newName) return { ok: false, error: "Proposed new name is required." };

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "currentName") || str(payload, "companyName");

  return submitWithCompanyAuth(
    record,
    (auth) =>
      buildChangeOfNameXml({
        companyNumber,
        companyName: companyName || companyNumber,
        companyAuthCode: auth,
        newName,
      }),
    "name change",
  );
}

function parseNatures(payload: Record<string, unknown>) {
  const raw = payload.naturesOfControlJson;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => String(n).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function submitAppointDirector(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const directorName = str(payload, "directorName");
  const forename = str(payload, "forename");
  const surname = str(payload, "surname");
  const dateOfBirth = str(payload, "dateOfBirth");
  const appointedOn = str(payload, "appointedOn");
  const personalCode = str(payload, "personalCode");
  const serviceAddress = str(payload, "serviceAddress");
  const residentialAddress = str(payload, "residentialAddress");

  if (
    !(directorName || (forename && surname)) ||
    !dateOfBirth ||
    !appointedOn ||
    !personalCode
  ) {
    return { ok: false, error: "Director appointment details are incomplete." };
  }

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;

  return submitWithCompanyAuth(
    record,
    (auth) =>
      buildOfficerAppointmentXml({
        companyNumber,
        companyName,
        companyAuthCode: auth,
        directorName: directorName || `${forename} ${surname}`.trim(),
        forename: forename || undefined,
        surname: surname || undefined,
        dateOfBirth,
        appointedOn,
        personalCode,
        serviceAddress: serviceAddress || companyName,
        residentialAddress: residentialAddress || undefined,
        serviceSameAsRegistered: payload.serviceSameAsRegistered === true,
        nationality: str(payload, "nationality"),
        countryOfResidence: str(payload, "countryOfResidence"),
      }),
    "director appointment",
  );
}

async function submitResignDirector(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const directorName = str(payload, "directorName");
  const resignedOn = str(payload, "resignedOn");
  if (!directorName || !resignedOn) {
    return { ok: false, error: "Director resignation details are incomplete." };
  }

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;

  return submitWithCompanyAuth(
    record,
    (auth) =>
      buildOfficerTerminationXml({
        companyNumber,
        companyName,
        companyAuthCode: auth,
        directorName,
        resignedOn,
      }),
    "director resignation",
  );
}

async function submitDissolveCompany(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;

  return submitWithCompanyAuth(
    record,
    (auth) =>
      buildStrikeOffApplicationXml({
        companyNumber,
        companyName,
        companyAuthCode: auth,
      }),
    "strike-off application",
  );
}

async function submitNotifyPsc(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const forename = str(payload, "forename");
  const surname = str(payload, "surname");
  const dateOfBirth = str(payload, "dateOfBirth");
  const personalCode = str(payload, "personalCode");
  const notificationDate = str(payload, "notificationDate");
  const residentialAddress = str(payload, "residentialAddress");
  const natures = parseNatures(payload);

  if (
    !forename ||
    !surname ||
    !dateOfBirth ||
    !personalCode ||
    !notificationDate ||
    !residentialAddress ||
    natures.length === 0
  ) {
    return { ok: false, error: "PSC notification details are incomplete." };
  }

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;

  return submitWithCompanyAuth(
    record,
    (auth) =>
      buildPscNotificationXml({
        companyNumber,
        companyName,
        companyAuthCode: auth,
        forename,
        surname,
        dateOfBirth,
        nationality: str(payload, "nationality") || "British",
        countryOfResidence:
          str(payload, "countryOfResidence") || "United Kingdom",
        personalCode,
        notificationDate,
        residentialAddress,
        naturesOfControl: natures,
      }),
    "PSC notification",
  );
}

async function submitChangePsc(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const forename = str(payload, "forename");
  const surname = str(payload, "surname");
  const changeDate = str(payload, "changeDate");
  const natures = parseNatures(payload);

  if (!forename || !surname || !changeDate || natures.length === 0) {
    return { ok: false, error: "PSC change details are incomplete." };
  }

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;

  return submitWithCompanyAuth(
    record,
    (auth) =>
      buildPscChangeXml({
        companyNumber,
        companyName,
        companyAuthCode: auth,
        forename,
        surname,
        changeDate,
        naturesOfControl: natures,
      }),
    "PSC change",
  );
}

async function submitCeasePsc(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const forename = str(payload, "forename");
  const surname = str(payload, "surname");
  const cessationDate = str(payload, "cessationDate");

  if (!forename || !surname || !cessationDate) {
    return { ok: false, error: "PSC cessation details are incomplete." };
  }

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;

  return submitWithCompanyAuth(
    record,
    (auth) =>
      buildPscCessationXml({
        companyNumber,
        companyName,
        companyAuthCode: auth,
        forename,
        surname,
        cessationDate,
      }),
    "PSC cessation",
  );
}

async function submitReturnOfAllotment(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const allotmentDate = str(payload, "allotmentDate");
  const shareClass = str(payload, "shareClass");
  const numSharesRaw = str(payload, "numShares");
  const numShares = Number(numSharesRaw);
  const nominalValue = str(payload, "nominalValue") || "1.00";
  const allotteeForename = str(payload, "allotteeForename");
  const allotteeSurname = str(payload, "allotteeSurname");
  const allotteeAddress = str(payload, "allotteeAddress");

  if (
    !allotmentDate ||
    !shareClass ||
    !Number.isFinite(numShares) ||
    numShares <= 0 ||
    !allotteeForename ||
    !allotteeSurname ||
    !allotteeAddress
  ) {
    return { ok: false, error: "Share allotment details are incomplete." };
  }

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;

  return submitWithCompanyAuth(
    record,
    (auth) =>
      buildReturnOfAllotmentXml({
        companyNumber,
        companyName,
        companyAuthCode: auth,
        allotmentDate,
        shareClass,
        numShares,
        nominalValue,
        amountPaid: str(payload, "amountPaid") || nominalValue,
        amountUnpaid: str(payload, "amountUnpaid") || "0.00",
        allotteeForename,
        allotteeSurname,
        allotteeAddress,
      }),
    "return of allotment",
  );
}

async function submitAccounts(
  record: MemoryChRequest,
): Promise<ChFilingSubmitResult> {
  const payload = record.payload ?? {};
  const companyAuthCode = await resolveCompanyAuthCode(payload);
  if (!companyAuthCode) {
    return {
      ok: false,
      error:
        "Company authentication code missing — add it on the client record or at checkout.",
    };
  }

  const companyNumber =
    str(payload, "companyNumber") || record.companyNumber || "";
  const companyName = str(payload, "companyName") || companyNumber;
  const periodStart = str(payload, "periodStart");
  const periodEnd = str(payload, "periodEnd");
  const accountsType = str(payload, "accountsType") || "micro";

  if (!companyNumber || !periodStart || !periodEnd) {
    return {
      ok: false,
      error: "Company number and accounting period dates are required.",
    };
  }

  const result = await submitAccountsFromPayload({
    companyNumber,
    companyName,
    companyAuthCode,
    periodStart,
    periodEnd,
    accountsType,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, mode: result.mode };
  }

  return {
    ok: true,
    submissionNumber: result.submissionNumber ?? null,
    mode: result.mode,
  };
}

/** Submit a paid Companies House request to the XML gateway. */
export async function submitChFilingFromRequest(
  record: MemoryChRequest,
  customerEmail?: string | null,
): Promise<ChFilingSubmitResult> {
  switch (record.serviceId) {
    case "confirmation-statement":
      return submitConfirmationStatement(record, customerEmail);
    case "incorporation":
    case "incorporation-same-day":
      return submitIncorporation(record);
    case "accounts-ixbrl":
      return submitAccounts(record);
    case "change-of-name":
    case "change-of-name-same-day":
      return submitChangeOfName(record);
    case "appoint-director":
      return submitAppointDirector(record);
    case "resign-director":
      return submitResignDirector(record);
    case "notify-psc":
      return submitNotifyPsc(record);
    case "change-psc":
      return submitChangePsc(record);
    case "cease-psc":
      return submitCeasePsc(record);
    case "return-of-allotment":
      return submitReturnOfAllotment(record);
    case "dissolve-company":
      return submitDissolveCompany(record);
    default:
      return { ok: false, error: `Unsupported Companies House service: ${record.serviceId}` };
  }
}

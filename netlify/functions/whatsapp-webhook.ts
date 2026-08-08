/**
 * Meta WhatsApp Cloud API webhook (Netlify Function).
 * GET  → hub challenge verification
 * POST → inbound messages → identity check → signed document link
 */

import {
  clearBotSession,
  createDocumentSignedUrl,
  findClientByPhone,
  findClientDocument,
  getBotSession,
  upsertBotSession,
  verifyClientPin,
} from "../../src/lib/supabase";
import {
  normalizeWhatsAppPhone,
  sendWhatsAppMessage,
} from "../../src/lib/whatsapp";

type NetlifyEvent = {
  httpMethod: string;
  queryStringParameters: Record<string, string | undefined> | null;
  body: string | null;
  isBase64Encoded?: boolean;
};

type NetlifyResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

type InboundText = {
  from: string;
  text: string;
};

const HELP_TEXT =
  "Hi — I can send documents your accountant has stored for you.\n\n" +
  "Try: “last year self assessment”, “corporation tax 2024”, or “VAT return”.\n" +
  "I’ll confirm your identity before sending a download link.";

export async function handler(event: NetlifyEvent): Promise<NetlifyResponse> {
  try {
    if (event.httpMethod === "GET") {
      return verifyWebhook(event);
    }
    if (event.httpMethod === "POST") {
      return handleIncoming(event);
    }
    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    console.error("whatsapp-webhook error", err);
    // Always 200 to Meta on unexpected errors after accept — avoids retry storms
    // for GET verification failures we still return 403 below.
    return { statusCode: 200, body: "OK" };
  }
}

function verifyWebhook(event: NetlifyEvent): NetlifyResponse {
  const params = event.queryStringParameters ?? {};
  const mode = params["hub.mode"];
  const token = params["hub.verify_token"];
  const challenge = params["hub.challenge"];
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/plain" },
      body: challenge,
    };
  }

  return { statusCode: 403, body: "Forbidden" };
}

async function handleIncoming(event: NetlifyEvent): Promise<NetlifyResponse> {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString("utf8")
    : (event.body ?? "");

  let payload: unknown;
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    return { statusCode: 200, body: "OK" };
  }

  const inbound = extractInboundText(payload);
  if (!inbound) {
    return { statusCode: 200, body: "OK" };
  }

  const phone = normalizeWhatsAppPhone(inbound.from);
  const text = inbound.text.trim();

  try {
    await processMessage(phone, text);
  } catch (err) {
    console.error("processMessage failed", err);
    await safeReply(
      phone,
      "Sorry — something went wrong fetching that. Please try again shortly or contact your accountant.",
    );
  }

  return { statusCode: 200, body: "OK" };
}

async function processMessage(phone: string, text: string): Promise<void> {
  const session = await getBotSession(phone);
  const stage = session?.session_stage ?? "IDLE";

  if (stage === "AWAITING_VERIFICATION" && session?.client_id) {
    await handleVerification(phone, text, session.client_id, session);
    return;
  }

  const intent = parseDocumentIntent(text);
  if (!intent) {
    await safeReply(phone, HELP_TEXT);
    return;
  }

  const client = await findClientByPhone(phone);
  if (!client) {
    await safeReply(
      phone,
      "We don’t recognise this WhatsApp number. Ask your accountant to register it on your client record, then try again.",
    );
    return;
  }

  await upsertBotSession(phone, {
    session_stage: "AWAITING_VERIFICATION",
    client_id: client.id,
    pending_document_category: intent.category,
    pending_tax_year: intent.taxYear,
  });

  await safeReply(
    phone,
    `Hi ${client.name}. To send your ${intent.label}, please reply with the last 4 digits of your tax ID (or the PIN your accountant gave you).`,
  );
}

async function handleVerification(
  phone: string,
  pinInput: string,
  clientId: string,
  session: {
    pending_document_category: string | null;
    pending_tax_year: string | null;
  },
): Promise<void> {
  if (/^(help|cancel|stop)$/i.test(pinInput.trim())) {
    await clearBotSession(phone);
    await safeReply(phone, HELP_TEXT);
    return;
  }

  const ok = await verifyClientPin(clientId, pinInput);
  if (!ok) {
    await safeReply(
      phone,
      "That PIN didn’t match. Please try again with the last 4 digits of your tax ID, or reply HELP to cancel.",
    );
    return;
  }

  const category = session.pending_document_category;
  if (!category) {
    await clearBotSession(phone);
    await safeReply(phone, "Verified — but I lost the document request. Please ask again.");
    return;
  }

  await upsertBotSession(phone, {
    session_stage: "AUTHENTICATED",
    client_id: clientId,
    pending_document_category: category,
    pending_tax_year: session.pending_tax_year,
  });

  const doc = await findClientDocument({
    clientId,
    category,
    taxYear: session.pending_tax_year,
  });

  if (!doc) {
    await clearBotSession(phone);
    await safeReply(
      phone,
      "You’re verified, but that document isn’t on file yet. Please contact your accountant.",
    );
    return;
  }

  const url = await createDocumentSignedUrl(doc.storage_path);
  await safeReply(
    phone,
    `Verified. Here’s *${doc.title}* (link expires in 15 minutes):\n${url}`,
  );
  await clearBotSession(phone);
}

function parseDocumentIntent(
  text: string,
): { category: string; taxYear: string | null; label: string } | null {
  const lower = text.toLowerCase();
  if (/^(help|hi|hello|menu)\b/.test(lower)) return null;

  const taxYear = extractTaxYear(lower);

  if (
    /self\s*assess|sa100|tax\s*return/.test(lower) ||
    (/\bsa\b/.test(lower) && /return|tax|last|year/.test(lower))
  ) {
    return {
      category: "self_assessment",
      taxYear: taxYear ?? defaultLastTaxYear(),
      label: taxYear
        ? `Self Assessment return (${taxYear})`
        : "last Self Assessment tax return",
    };
  }

  if (/corporation\s*tax|ct600|\bct\s*return\b/.test(lower)) {
    return {
      category: "corporation_tax",
      taxYear,
      label: taxYear
        ? `Corporation Tax return (${taxYear})`
        : "Corporation Tax return",
    };
  }

  if (/confirmation\s*statement|cs01/.test(lower)) {
    return {
      category: "confirmation_statement",
      taxYear,
      label: "Confirmation Statement",
    };
  }

  if (/\bvat\b/.test(lower)) {
    return {
      category: "vat_return",
      taxYear,
      label: taxYear ? `VAT return (${taxYear})` : "VAT return",
    };
  }

  if (/annual\s*accounts|accounts\s*filing/.test(lower)) {
    return {
      category: "annual_accounts",
      taxYear,
      label: "annual accounts",
    };
  }

  return null;
}

function extractTaxYear(text: string): string | null {
  const fy = text.match(/\b(20\d{2})\s*[-/]\s*(\d{2})\b/);
  if (fy) return `${fy[1]}-${fy[2]}`;

  const year = text.match(/\b(20\d{2})\b/);
  if (year) {
    const y = Number(year[1]);
    return `${y}-${String(y + 1).slice(-2)}`;
  }

  if (/last\s+year|previous\s+year/.test(text)) {
    return defaultLastTaxYear();
  }

  return null;
}

/** UK tax year ending 5 April — rough “last completed year” for bot matching. */
function defaultLastTaxYear(): string {
  const now = new Date();
  const year = now.getUTCMonth() > 3 || (now.getUTCMonth() === 3 && now.getUTCDate() >= 6)
    ? now.getUTCFullYear()
    : now.getUTCFullYear() - 1;
  const end = year;
  const start = end - 1;
  return `${start}-${String(end).slice(-2)}`;
}

function extractInboundText(payload: unknown): InboundText | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            type?: string;
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages;
      if (!messages?.length) continue;
      const msg = messages[0];
      if (!msg?.from || msg.type !== "text" || !msg.text?.body) continue;
      return { from: msg.from, text: msg.text.body };
    }
  }
  return null;
}

async function safeReply(to: string, message: string): Promise<void> {
  try {
    const result = await sendWhatsAppMessage(to, message);
    if (!result.ok) {
      console.error("WhatsApp send failed", result.status, result.body);
    }
  } catch (err) {
    console.error("WhatsApp send error", err);
  }
}

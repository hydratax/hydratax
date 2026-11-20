/**
 * Meta WhatsApp Cloud API helpers (shared HydraTax business number).
 * Platform env: WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN (+ APP_SECRET / VERIFY for webhook).
 */

const GRAPH_VERSION = "v21.0";

export function whatsappPlatformConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
      process.env.WHATSAPP_ACCESS_TOKEN?.trim(),
  );
}

function graphCreds() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required",
    );
  }
  return { phoneNumberId, accessToken };
}

/** Strip non-digits so +44… and 44… match the same client row. */
export function normalizeWhatsAppPhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  // UK local 07… → 447…
  if (digits.startsWith("0") && digits.length === 11) {
    digits = `44${digits.slice(1)}`;
  }
  return digits;
}

export async function sendWhatsAppMessage(
  to: string,
  message: string,
): Promise<{ ok: boolean; status: number; body: string; messageId?: string }> {
  const { phoneNumberId, accessToken } = graphCreds();

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeWhatsAppPhone(to),
        type: "text",
        text: { preview_url: true, body: message.slice(0, 4096) },
      }),
    },
  );

  const body = await res.text();
  let messageId: string | undefined;
  try {
    const json = JSON.parse(body) as {
      messages?: Array<{ id?: string }>;
    };
    messageId = json.messages?.[0]?.id;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, body, messageId };
}

/** Upload PDF/bytes then send as a WhatsApp document message. */
export async function sendWhatsAppDocument(opts: {
  to: string;
  filename: string;
  bytes: Buffer;
  mimeType?: string;
  caption?: string;
}): Promise<{ ok: boolean; status: number; body: string; messageId?: string }> {
  const { phoneNumberId, accessToken } = graphCreds();
  const mime = opts.mimeType || "application/pdf";
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append(
    "file",
    new Blob([new Uint8Array(opts.bytes)], { type: mime }),
    opts.filename || "document.pdf",
  );

  const upload = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    },
  );
  const uploadText = await upload.text();
  if (!upload.ok) {
    return { ok: false, status: upload.status, body: uploadText };
  }
  let mediaId: string | undefined;
  try {
    mediaId = (JSON.parse(uploadText) as { id?: string }).id;
  } catch {
    mediaId = undefined;
  }
  if (!mediaId) {
    return { ok: false, status: 502, body: uploadText };
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeWhatsAppPhone(opts.to),
        type: "document",
        document: {
          id: mediaId,
          filename: opts.filename.slice(0, 240),
          ...(opts.caption
            ? { caption: opts.caption.slice(0, 1024) }
            : {}),
        },
      }),
    },
  );
  const body = await res.text();
  let messageId: string | undefined;
  try {
    const json = JSON.parse(body) as {
      messages?: Array<{ id?: string }>;
    };
    messageId = json.messages?.[0]?.id;
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, body, messageId };
}

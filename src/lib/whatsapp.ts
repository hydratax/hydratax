/**
 * Direct Meta WhatsApp Cloud API helper (no SDK).
 * Free within the 24-hour customer service window for reply messages.
 */

const GRAPH_VERSION = "v19.0";

export async function sendWhatsAppMessage(
  to: string,
  message: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN are required",
    );
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
        to: normalizeWhatsAppPhone(to),
        type: "text",
        text: { preview_url: true, body: message },
      }),
    },
  );

  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

/** Strip non-digits so +44… and 44… match the same client row. */
export function normalizeWhatsAppPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

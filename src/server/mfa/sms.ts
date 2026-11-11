/**
 * Optional Twilio SMS for MFA OTP.
 * Without TWILIO_* env vars, phone 2FA cannot send messages.
 */

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}

export async function sendSmsOtp(opts: {
  toE164: string;
  body: string;
}): Promise<"twilio" | "unavailable"> {
  if (!smsConfigured()) return "unavailable";

  const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const token = process.env.TWILIO_AUTH_TOKEN!.trim();
  const from = process.env.TWILIO_FROM_NUMBER!.trim();
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: opts.toE164,
        From: from,
        Body: opts.body,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMS send failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return "twilio";
}

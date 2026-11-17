/**
 * Send client mail via a connected Gmail or Microsoft 365 mailbox (OAuth).
 */

import type { EmailAttachment } from "@/server/email/transactional";
import { encryptSecret, decryptSecret } from "@/server/hmrc/crypto";
import { mailboxOAuthEnv } from "@/lib/email/mailbox-oauth";

export type MailboxTokenBlob = {
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  provider: "gmail" | "outlook";
};

export type ConnectedMailbox = {
  practiceId: string;
  provider: "gmail" | "outlook";
  address: string;
  displayName: string | null;
  credentialsEncrypted: string;
};

export function encryptMailboxTokens(blob: MailboxTokenBlob): string {
  return encryptSecret(JSON.stringify(blob));
}

export function decryptMailboxTokens(payload: string): MailboxTokenBlob {
  let raw = payload;
  try {
    raw = decryptSecret(payload);
  } catch {
    // Legacy plain JSON from early OAuth callbacks
    raw = payload;
  }
  const parsed = JSON.parse(raw) as MailboxTokenBlob;
  if (parsed.provider !== "gmail" && parsed.provider !== "outlook") {
    throw new Error("Invalid mailbox token blob");
  }
  return parsed;
}

export async function loadConnectedMailbox(
  practiceId: string,
): Promise<ConnectedMailbox | null> {
  const { isDemoMode, isMemoryStore, isSupabaseConfigured } = await import(
    "@/lib/env"
  );
  const { demoStore } = await import("@/server/demo/store");

  type Row = {
    channel: string;
    status: string;
    externalAccountId: string | null;
    displayName: string | null;
    credentialsEncrypted: string | null;
    metadata?: Record<string, unknown>;
  };

  let rows: Row[] = [];

  if (isMemoryStore() || isDemoMode()) {
    const store = demoStore as {
      channelConnections?: Array<{
        channel: string;
        status: string;
        externalAccountId: string | null;
        displayName: string | null;
        credentialsEncrypted?: string | null;
        metadata?: Record<string, unknown>;
      }>;
    };
    rows = (store.channelConnections ?? []).map((c) => ({
      channel: c.channel,
      status: c.status,
      externalAccountId: c.externalAccountId,
      displayName: c.displayName,
      credentialsEncrypted: c.credentialsEncrypted ?? null,
      metadata: c.metadata ?? {},
    }));
  } else if (isSupabaseConfigured()) {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("practice_channel_connections")
      .select(
        "channel, status, external_account_id, display_name, credentials_encrypted, metadata",
      )
      .eq("practice_id", practiceId)
      .in("channel", ["gmail", "outlook"])
      .eq("status", "connected");
    rows = (data ?? []).map((r) => ({
      channel: r.channel as string,
      status: r.status as string,
      externalAccountId: (r.external_account_id as string | null) ?? null,
      displayName: (r.display_name as string | null) ?? null,
      credentialsEncrypted: (r.credentials_encrypted as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    }));
  }

  const ready = rows.find(
    (r) =>
      (r.channel === "gmail" || r.channel === "outlook") &&
      r.status === "connected" &&
      r.externalAccountId &&
      r.credentialsEncrypted &&
      r.metadata?.oauthReady === true,
  );
  if (!ready?.externalAccountId || !ready.credentialsEncrypted) return null;

  return {
    practiceId,
    provider: ready.channel as "gmail" | "outlook",
    address: ready.externalAccountId,
    displayName: ready.displayName,
    credentialsEncrypted: ready.credentialsEncrypted,
  };
}

async function persistMailboxTokens(
  practiceId: string,
  provider: "gmail" | "outlook",
  blob: MailboxTokenBlob,
) {
  const encrypted = encryptMailboxTokens(blob);
  const { isDemoMode, isMemoryStore, isSupabaseConfigured } = await import(
    "@/lib/env"
  );
  const { demoStore } = await import("@/server/demo/store");

  if (isMemoryStore() || isDemoMode()) {
    const store = demoStore as {
      channelConnections?: Array<{
        channel: string;
        credentialsEncrypted?: string | null;
      }>;
    };
    for (const c of store.channelConnections ?? []) {
      if (c.channel === provider) c.credentialsEncrypted = encrypted;
    }
    return;
  }

  if (!isSupabaseConfigured()) return;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase
    .from("practice_channel_connections")
    .update({
      credentials_encrypted: encrypted,
      updated_at: new Date().toISOString(),
    })
    .eq("practice_id", practiceId)
    .eq("channel", provider);
}

async function refreshAccessToken(
  practiceId: string,
  blob: MailboxTokenBlob,
): Promise<string> {
  if (!blob.refresh_token) {
    if (blob.access_token) return blob.access_token;
    throw new Error("Mailbox connection expired");
  }

  const env = mailboxOAuthEnv(blob.provider);
  if (!env.clientId || !env.clientSecret) {
    throw new Error("Mailbox OAuth is not configured");
  }

  const tokenUrl =
    blob.provider === "gmail"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";

  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: blob.refresh_token,
    grant_type: "refresh_token",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Mailbox token refresh failed (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (!data.access_token) throw new Error("Mailbox token refresh returned no access token");

  const next: MailboxTokenBlob = {
    ...blob,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? blob.refresh_token,
    expires_at: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : blob.expires_at,
  };
  await persistMailboxTokens(practiceId, blob.provider, next);
  return data.access_token;
}

async function validAccessToken(
  practiceId: string,
  blob: MailboxTokenBlob,
): Promise<string> {
  const skew = 60_000;
  if (
    blob.access_token &&
    blob.expires_at &&
    blob.expires_at - Date.now() > skew
  ) {
    return blob.access_token;
  }
  return refreshAccessToken(practiceId, blob);
}

function toRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to]).map((t) => t.trim()).filter(Boolean);
}

function buildMimeMessage(opts: {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}): string {
  const boundary = `hydratax_${Date.now().toString(36)}`;
  const hasAttachments = Boolean(opts.attachments?.length);
  const hasHtml = Boolean(opts.html);

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
    `Subject: ${opts.subject.replace(/\r?\n/g, " ")}`,
    "MIME-Version: 1.0",
  ];

  if (!hasAttachments && !hasHtml) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    return `${headers.join("\r\n")}\r\n\r\n${opts.text}`;
  }

  if (!hasAttachments && hasHtml) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      opts.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      opts.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts: string[] = [headers.join("\r\n"), ""];

  if (hasHtml) {
    const alt = `${boundary}_alt`;
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: multipart/alternative; boundary="${alt}"`);
    parts.push("");
    parts.push(`--${alt}`);
    parts.push('Content-Type: text/plain; charset="UTF-8"');
    parts.push("");
    parts.push(opts.text);
    parts.push(`--${alt}`);
    parts.push('Content-Type: text/html; charset="UTF-8"');
    parts.push("");
    parts.push(opts.html!);
    parts.push(`--${alt}--`);
  } else {
    parts.push(`--${boundary}`);
    parts.push('Content-Type: text/plain; charset="UTF-8"');
    parts.push("");
    parts.push(opts.text);
  }

  for (const a of opts.attachments ?? []) {
    const type = a.contentType || "application/octet-stream";
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${type}; name="${a.filename}"`);
    parts.push("Content-Transfer-Encoding: base64");
    parts.push(
      `Content-Disposition: attachment; filename="${a.filename}"`,
    );
    parts.push("");
    parts.push(a.content.replace(/\s+/g, ""));
  }
  parts.push(`--${boundary}--`);
  parts.push("");
  return parts.join("\r\n");
}

function base64Url(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendGmail(opts: {
  accessToken: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}) {
  const raw = base64Url(
    buildMimeMessage({
      from: opts.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    }),
  );
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );
  if (!res.ok) {
    const err = (await res.text()).slice(0, 300);
    throw new Error(`Gmail send failed: ${err}`);
  }
}

async function sendOutlook(opts: {
  accessToken: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}) {
  const message: Record<string, unknown> = {
    subject: opts.subject,
    body: {
      contentType: opts.html ? "HTML" : "Text",
      content: opts.html || opts.text,
    },
    toRecipients: opts.to.map((address) => ({
      emailAddress: { address },
    })),
  };
  if (opts.attachments?.length) {
    message.attachments = opts.attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.contentType || "application/octet-stream",
      contentBytes: a.content,
    }));
  }

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) {
    const err = (await res.text()).slice(0, 300);
    throw new Error(`Outlook send failed: ${err}`);
  }
}

export async function sendViaConnectedMailbox(opts: {
  mailbox: ConnectedMailbox;
  fromHeader: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const blob = decryptMailboxTokens(opts.mailbox.credentialsEncrypted);
  const accessToken = await validAccessToken(opts.mailbox.practiceId, blob);
  const to = toRecipients(opts.to);
  if (!to.length) throw new Error("No recipients");

  if (opts.mailbox.provider === "gmail") {
    await sendGmail({
      accessToken,
      from: opts.fromHeader,
      to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    });
    return;
  }

  await sendOutlook({
    accessToken,
    to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  });
}

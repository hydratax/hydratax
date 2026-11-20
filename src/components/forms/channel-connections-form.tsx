"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  disconnectPracticeChannel,
  type ChannelConnectionRecord,
} from "@/server/actions/correspondence";
import type { MailboxOAuthProvider } from "@/lib/email/mailbox-oauth";
import type { WhatsAppAllocation } from "@/server/actions/whatsapp-desk";

export function ChannelConnectionsForm({
  connections,
  whatsappAllocation = null,
  whatsappPlatformReady = false,
}: {
  connections: ChannelConnectionRecord[];
  whatsappAllocation?: WhatsAppAllocation | null;
  whatsappPlatformReady?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const gmail = connections.find(
    (c) => c.channel === "gmail" && c.status === "connected",
  );
  const outlook = connections.find(
    (c) => c.channel === "outlook" && c.status === "connected",
  );
  const connectedMailbox = gmail || outlook;

  function refreshQuietly() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-5">
        <div>
          <h2 className="display text-2xl text-ink">Outbound client email</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {connectedMailbox
              ? `Sending from ${
                  connectedMailbox.channel === "outlook"
                    ? "Microsoft 365"
                    : "Gmail"
                } · ${connectedMailbox.externalAccountId}`
              : "Sending with your practice name. Connect a mailbox to send as yourself."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!outlook ? (
            <MailboxConnectButton
              provider="gmail"
              label={gmail ? "Reconnect Gmail" : "Connect Gmail"}
              connected={Boolean(gmail)}
            />
          ) : null}
          {!gmail ? (
            <MailboxConnectButton
              provider="outlook"
              label={
                outlook
                  ? "Reconnect Microsoft 365"
                  : "Connect Microsoft 365"
              }
              connected={Boolean(outlook)}
            />
          ) : null}
          {gmail ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  try {
                    await disconnectPracticeChannel("gmail");
                    refreshQuietly();
                  } catch {
                    /* freeze */
                  }
                });
              }}
            >
              Disconnect
            </button>
          ) : null}
          {outlook ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  try {
                    await disconnectPracticeChannel("outlook");
                    refreshQuietly();
                  } catch {
                    /* freeze */
                  }
                });
              }}
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </div>

      <div className="panel space-y-3 p-5">
        <div>
          <h2 className="display text-2xl text-ink">WhatsApp (HydraTax)</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Send reminders and documents from the desk on HydraTax’s shared
            business number. You do not need to link your own WhatsApp.
          </p>
        </div>
        {!whatsappPlatformReady ? (
          <p className="text-sm text-ink-soft">Not available yet.</p>
        ) : !whatsappAllocation?.enabled ? (
          <p className="text-sm text-ink-soft">
            WhatsApp volume has not been assigned to this practice yet.
          </p>
        ) : (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="font-semibold text-ink">Messages this month</span>
              <span className="mt-0.5 block paye-digits text-ink-soft">
                {whatsappAllocation.usedMessages} /{" "}
                {whatsappAllocation.monthlyMessageLimit} ·{" "}
                {whatsappAllocation.remainingMessages} left
              </span>
            </p>
            <p>
              <span className="font-semibold text-ink">Documents this month</span>
              <span className="mt-0.5 block paye-digits text-ink-soft">
                {whatsappAllocation.usedDocuments} /{" "}
                {whatsappAllocation.monthlyDocumentLimit} ·{" "}
                {whatsappAllocation.remainingDocuments} left
              </span>
            </p>
            {whatsappAllocation.apiKeyPrefix ? (
              <p className="sm:col-span-2">
                <span className="font-semibold text-ink">Credential</span>
                <span className="mt-0.5 block font-mono text-xs text-ink-soft">
                  {whatsappAllocation.apiKeyPrefix}…
                </span>
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function MailboxConnectButton({
  provider,
  label,
  connected,
}: {
  provider: MailboxOAuthProvider;
  label: string;
  connected: boolean;
}) {
  return (
    <a
      href={`/api/oauth/mailbox/${provider}/start`}
      className={connected ? "btn btn-secondary" : "btn btn-primary"}
    >
      {label}
    </a>
  );
}

